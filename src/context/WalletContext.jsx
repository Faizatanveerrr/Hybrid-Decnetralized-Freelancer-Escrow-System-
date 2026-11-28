import React, { createContext, useContext, useState, useEffect } from 'react';
import { connectBrowserWallet, shortenAddress } from '../services/blockchain.js';
import { getWalletInfoApi, updateUserApi, getMyPaymentsApi, useManagedWalletApi, getPayoutConfigApi, validatePayoutApi, createPayoutApi, getMyPayoutsApi } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';
import { onchain, chainError, loadChainConfig } from '../services/chain.js';
import { loadPaymentConfig, startTopUp } from '../services/payments.js';

const WalletContext = createContext(null);

export const WalletProvider = ({ children }) => {
  const { user, updateUser } = useAuth();
  const [connected, setConnected] = useState(Boolean(user?.walletAddress));
  const [address, setAddress] = useState(user?.walletAddress || '');
  const [balance, setBalance] = useState(0);
  const [lockedInEscrow, setLockedInEscrow] = useState(0);
  const [ledgerMode, setLedgerMode] = useState(false);
  const [network, setNetwork] = useState(user?.walletAddress ? 'Sepolia Testnet' : 'Not Connected');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chainEnabled, setChainEnabled] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [paymentMode, setPaymentMode] = useState('off');
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [managedAvailable, setManagedAvailable] = useState(false);
  const [payoutConfig, setPayoutConfig] = useState({ enabled: false });
  const [payouts, setPayouts] = useState([]);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  useEffect(() => {
    loadChainConfig().then((c) => setChainEnabled(Boolean(c.enabled)));
    loadPaymentConfig().then((c) => {
      setPaymentsEnabled(Boolean(c.enabled));
      setPaymentMode(c.mode || 'off');
    });
    if (user) getPayoutConfigApi().then((r) => setPayoutConfig(r.data.config || { enabled: false })).catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.walletAddress) {
      setAddress(user.walletAddress);
      setConnected(true);
      fetchWalletData(user.walletAddress);
    } else {
      setAddress('');
      setConnected(false);
      setBalance(0);
      setLockedInEscrow(0);
      setNetwork('Not Connected');
    }
  }, [user]);

  const fetchWalletData = async (targetAddress) => {
    const queryId = user?._id || user?.id || targetAddress;
    if (!queryId) return;
    try {
      // Recover any payment that was made but not yet credited (e.g. the tab was closed).
      if (paymentsEnabled) await getMyPaymentsApi().catch(() => {});
      // Also finishes/refunds any withdrawal that was left half-done.
      getMyPayoutsApi().then((r) => setPayouts(r.data.payouts || [])).catch(() => {});
      const res = await getWalletInfoApi(queryId);
      if (res.data?.success && res.data.wallet) {
        setBalance(res.data.wallet.balanceUSDC || 0);
        setLedgerMode(Boolean(res.data.wallet.ledgerMode));
        setLockedInEscrow(res.data.wallet.lockedEscrowUSDC || 0);
        if (res.data.wallet.address) setAddress(res.data.wallet.address);
        if (res.data.wallet.network) setNetwork(res.data.wallet.network);
        setManagedAvailable(Boolean(res.data.wallet.managedAvailable));
        // The server reads the real INR token balance from the blockchain (works for any wallet type).
        if (res.data.wallet.onChainBalance !== null && res.data.wallet.onChainBalance !== undefined) {
          setBalance(res.data.wallet.onChainBalance);
        }
        // Keep the stored profile in sync with the server (wallet created/changed server-side).
        const w = res.data.wallet;
        if (w.address && (w.address !== user?.walletAddress || w.walletType !== user?.walletType)) {
          updateUser({ walletAddress: w.address, walletType: w.walletType });
        }
      }
    } catch (e) {
      // If error or empty, keep values at 0
      setBalance(0);
      setLockedInEscrow(0);
    }
  };

  const connectWallet = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await connectBrowserWallet();
      if (result.success) {
        if (user && updateUser) {
          // Persist server-side first: the backend verifies escrow contracts against this address.
          try {
            const saved = await updateUserApi(user._id || user.id, { walletAddress: result.address });
            updateUser({ walletAddress: result.address, walletType: saved.data?.user?.walletType || 'external' });
          } catch (e) {
            const message = e.response?.data?.message || 'Could not save the wallet to your profile.';
            setError(message);
            return { success: false, error: message };
          }
        }
        setAddress(result.address);
        setConnected(true);
        setNetwork(result.network || 'Sepolia Testnet');
        await fetchWalletData(result.address);
        return result;
      } else {
        setError(result.error);
        return result;
      }
    } finally {
      setLoading(false);
    }
  };

  // Pay with UPI / Paytm / card; the server then credits the same amount of INR tokens.
  const topUp = async (amount) => {
    setTopUpLoading(true);
    setError(null);
    try {
      const result = await startTopUp({ amount, user });
      await fetchWalletData(address);
      return { success: true, message: result.message };
    } catch (err) {
      if (err.cancelled) return { success: false, cancelled: true, error: err.message };
      const message = err.response?.data?.message || err.message || 'Payment failed.';
      setError(message);
      return { success: false, error: message };
    } finally {
      setTopUpLoading(false);
    }
  };

  // Withdraw INR tokens to a UPI ID. MetaMask users send the tokens to the treasury first.
  const withdraw = async (amount, vpa) => {
    setWithdrawLoading(true);
    setError(null);
    try {
      let txHash;
      if (user?.walletType !== 'managed') {
        // Validate first so tokens are never sent for a request the server would reject.
        const check = await validatePayoutApi({ amount, vpa });
        txHash = (await onchain.sendToTreasury(user, check.data.treasuryAddress, amount)).txHash;
      }
      const res = await createPayoutApi({ amount, vpa, txHash });
      await fetchWalletData(address);
      return { success: true, message: res.data.message };
    } catch (err) {
      const message = err.response?.data?.message || chainError(err);
      await fetchWalletData(address);
      return { success: false, error: message };
    } finally {
      setWithdrawLoading(false);
    }
  };

  const claimTestInr = async () => {
    setFaucetLoading(true);
    setError(null);
    try {
      const result = await onchain.faucet(user);
      await fetchWalletData(address);
      return { success: true, txHash: result.txHash };
    } catch (err) {
      const message = chainError(err);
      setError(message);
      return { success: false, error: message };
    } finally {
      setFaucetLoading(false);
    }
  };

  // Go back to the platform-managed wallet (no MetaMask needed).
  const switchToManaged = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await useManagedWalletApi();
      const saved = res.data.user;
      updateUser({ walletAddress: saved.walletAddress, walletType: saved.walletType });
      setAddress(saved.walletAddress);
      await fetchWalletData(saved.walletAddress);
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const disconnectWallet = () => {
    setConnected(false);
    setAddress('');
    setBalance(0);
    setLockedInEscrow(0);
    setNetwork('Not Connected');
    setError(null);
  };

  return (
    <WalletContext.Provider
      value={{
        connected,
        address,
        shortAddress: shortenAddress(address),
        balance,
        lockedInEscrow,
        ledgerMode,
        network,
        loading,
        error,
        connectWallet,
        walletType: user?.walletType || 'external',
        managedAvailable,
        switchToManaged,
        chainEnabled,
        faucetLoading,
        claimTestInr,
        payoutConfig,
        payouts,
        withdrawLoading,
        withdraw,
        paymentsEnabled,
        paymentMode,
        topUpLoading,
        topUp,
        disconnectWallet,
        refreshWallet: () => fetchWalletData(address)
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => useContext(WalletContext);
