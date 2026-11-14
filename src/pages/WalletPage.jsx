import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  History,
  AlertCircle
} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Card from '../components/common/Card.jsx';
import Button from '../components/common/Button.jsx';
import Toast from '../components/common/Toast.jsx';
import Modal from '../components/common/Modal.jsx';
import Loading from '../components/common/Loading.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';
import { getTransactionsApi } from '../services/api.js';
import { shortenAddress, getEtherscanTxUrl } from '../services/blockchain.js';

export default function WalletPage() {
  const { user } = useAuth();
  const { address, balance, lockedInEscrow, network, connected, connectWallet, error: walletError, chainEnabled, faucetLoading, claimTestInr, paymentsEnabled, paymentMode, topUpLoading, topUp, walletType, managedAvailable, switchToManaged, loading: walletBusy, payoutConfig, payouts, withdrawLoading, withdraw } = useWallet();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('1000');
  const [demoMethod, setDemoMethod] = useState('upi');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawVpa, setWithdrawVpa] = useState(user?.upiId || '');

  const handleWithdraw = async () => {
    const amount = Number(withdrawAmount);
    if (!(amount >= 1)) {
      alert('Enter an amount of at least ₹1.');
      return;
    }
    if (!/^[a-zA-Z0-9._-]{2,100}@[a-zA-Z0-9]{2,64}$/.test(withdrawVpa.trim())) {
      alert('Enter a valid UPI ID, like name@okhdfcbank.');
      return;
    }
    setWithdrawOpen(false);
    const result = await withdraw(amount, withdrawVpa.trim());
    if (result.success) setToastMessage(result.message);
    else alert(result.error);
  };

  const handleTopUp = async () => {
    const amount = Number(topUpAmount);
    if (!(amount >= 1)) {
      alert('Enter an amount of at least ₹1.');
      return;
    }
    setTopUpOpen(false);
    const result = await topUp(amount);
    if (result.success) setToastMessage(result.message);
    else if (!result.cancelled) alert(result.error);
  };

  useEffect(() => {
    loadTransactions();
  }, [user, address]);

  const loadTransactions = async () => {
    if (!user?._id && !user?.id) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getTransactionsApi(user._id || user.id);
      if (res.data?.success) {
        setTransactions(res.data.transactions || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DashboardLayout title="Wallet & Escrow Vault">
      {payouts.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
          <h3 className="font-bold text-slate-800 mb-3">Withdrawals</h3>
          <div className="divide-y divide-slate-100">
            {payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-semibold text-slate-800">₹{p.amount.toLocaleString()} to {p.vpa}</p>
                  <p className="text-[11px] text-slate-500">
                    {new Date(p.createdAt).toLocaleString()}
                    {p.mode === 'simulated' ? ' · simulated' : ''}
                    {p.utr ? ` · ref ${p.utr}` : ''}
                  </p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                  p.status === 'PROCESSED' ? 'bg-emerald-100 text-emerald-700'
                  : p.status === 'REFUNDED' || p.status === 'CANCELLED' ? 'bg-slate-100 text-slate-600'
                  : p.status === 'FAILED' ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
                }`}>
                  {p.status === 'REFUNDED' ? 'Refunded to wallet' : p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={topUpOpen} onClose={() => setTopUpOpen(false)} title="Add money to your wallet" maxWidth="max-w-md">
        <div className="space-y-4">
          {paymentMode === 'demo' && (
            <div className="rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-bold">DEMO CHECKOUT - no real payment is made</p>
              <p className="mt-0.5">
                No payment gateway is connected, so this form simulates one. The tokens are credited as if the
                payment succeeded. The real Razorpay checkout (UPI / Paytm / cards) replaces this screen as soon as
                Razorpay keys are configured.
              </p>
            </div>
          )}
          <p className="text-sm text-slate-600">
            Pay with UPI, Paytm or card. You receive the same amount as INR tokens (₹1 = 1 token) in your
            wallet, which you then use to fund escrow milestones through the smart contract.
          </p>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Amount (₹)</label>
            <input
              type="number"
              min="1"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2 mt-2">
              {[500, 1000, 5000, 10000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTopUpAmount(String(v))}
                  className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  ₹{v.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
          {paymentMode === 'demo' ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pay using (demo)</label>
              <div className="flex gap-2">
                {[['upi', 'UPI'], ['paytm', 'Paytm'], ['card', 'Card']].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDemoMethod(key)}
                    className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg border ${
                      demoMethod === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
              Test mode: no real money is charged. In the payment window choose UPI and enter
              <span className="font-mono font-bold"> success@razorpay</span> to simulate a successful payment.
            </p>
          )}
          <Button variant="primary" className="w-full" onClick={handleTopUp}>
            {paymentMode === 'demo' ? 'Pay (demo) ₹' : 'Pay ₹'}{Number(topUpAmount) > 0 ? Number(topUpAmount).toLocaleString() : '0'}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={withdrawOpen} onClose={() => setWithdrawOpen(false)} title="Withdraw to UPI" maxWidth="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Your INR tokens are returned to the platform and the same amount in rupees is sent to your UPI ID
            (₹1 = 1 token). Your UPI ID is linked to your bank account.
          </p>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Amount (₹) - available ₹{balance.toLocaleString()}</label>
            <input
              type="number"
              min="1"
              max={payoutConfig.max}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">Minimum ₹{payoutConfig.min || 1}, maximum ₹{(payoutConfig.max || 10000).toLocaleString()} per withdrawal.</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">UPI ID</label>
            <input
              type="text"
              placeholder="name@okhdfcbank"
              value={withdrawVpa}
              onChange={(e) => setWithdrawVpa(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {payoutConfig.mode === 'simulated' ? (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              Demo mode: the tokens really move on the blockchain, but no money is sent to a bank.
            </p>
          ) : !payoutConfig.live ? (
            <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
              Test mode: the payout goes through the gateway's test environment, so no real money is sent.
            </p>
          ) : null}
          <Button variant="primary" className="w-full" onClick={handleWithdraw}>
            Withdraw ₹{Number(withdrawAmount) > 0 ? Number(withdrawAmount).toLocaleString() : '0'}
          </Button>
        </div>
      </Modal>

      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage('')} />}

      {walletError && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{walletError}</span>
        </div>
      )}

      {/* Top Wallet Overview Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        {/* Main Wallet Card */}
        <Card className="md:col-span-2 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs uppercase font-bold tracking-wider text-indigo-300">
                Web3 Wallet Status
              </span>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                connected ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700 text-slate-300'
              }`}>
                {connected ? network : 'Disconnected'}
              </span>
            </div>

            {connected && address ? (
              <div className="flex items-center gap-2 mb-6">
                <span className="font-mono text-sm sm:text-base font-bold text-slate-200 truncate">
                  {address}
                </span>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
                  title="Copy Address"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <div className="mb-6 py-2">
                <p className="text-lg font-bold text-slate-200">Connect your wallet</p>
                <p className="text-xs text-indigo-300 mt-0.5">
                  Link MetaMask or any browser Web3 wallet to manage escrow funds.
                </p>
                <div className="mt-4">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Wallet}
                    onClick={connectWallet}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold"
                  >
                    Connect Wallet
                  </Button>
                </div>
              </div>
            )}

            {connected && (managedAvailable || walletType === 'managed') && (
              <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-indigo-100">
                {walletType === 'managed' ? (
                  <>
                    <p className="font-bold text-white">Platform-managed wallet</p>
                    <p className="mt-0.5 text-indigo-200">
                      EscrowX created this wallet for you and signs transactions on your behalf, so you do not need
                      MetaMask. The platform holds the key (encrypted). Prefer to hold your own keys?
                    </p>
                    <Button
                      variant="outline"
                      className="mt-2 text-xs bg-white/10 text-indigo-100 border-white/30 hover:bg-white/20"
                      onClick={connectWallet}
                      loading={walletBusy}
                    >
                      Use my own MetaMask wallet instead
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-white">Your own wallet (MetaMask)</p>
                    <p className="mt-0.5 text-indigo-200">You sign every transaction yourself and hold your own keys.</p>
                    <Button
                      variant="outline"
                      className="mt-2 text-xs bg-white/10 text-indigo-100 border-white/30 hover:bg-white/20"
                      onClick={switchToManaged}
                      loading={walletBusy}
                    >
                      Switch to platform-managed wallet
                    </Button>
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-indigo-800/80">
              <div>
                <span className="text-xs text-indigo-300">Available Balance</span>
                <h3 className="text-2xl sm:text-3xl font-extrabold mt-1 text-white">
                  ₹{balance.toLocaleString()} <span className="text-sm font-semibold text-indigo-300">INR</span>
                </h3>
                {paymentsEnabled && connected && (
                  <Button
                    variant="primary"
                    className="mt-2 mr-2 text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                    onClick={() => setTopUpOpen(true)}
                    loading={topUpLoading}
                  >
                    Add money (UPI / Paytm)
                  </Button>
                )}
                {payoutConfig.enabled && connected && (
                  <Button
                    variant="outline"
                    className="mt-2 mr-2 text-xs bg-white/10 text-indigo-100 border-white/30 hover:bg-white/20"
                    onClick={() => setWithdrawOpen(true)}
                    loading={withdrawLoading}
                  >
                    Withdraw to UPI
                  </Button>
                )}
                {chainEnabled && connected && (
                  <Button
                    variant="outline"
                    className="mt-2 text-xs bg-white/10 text-indigo-100 border-white/30 hover:bg-white/20"
                    onClick={claimTestInr}
                    loading={faucetLoading}
                  >
                    Get test INR (₹10,000)
                  </Button>
                )}
              </div>
              <div>
                <span className="text-xs text-indigo-300">Locked in Active Escrow</span>
                <h3 className="text-2xl sm:text-3xl font-extrabold mt-1 text-indigo-200">
                  ₹{lockedInEscrow.toLocaleString()} <span className="text-sm font-semibold text-indigo-300">INR</span>
                </h3>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-indigo-800/60 flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20"
              onClick={loadTransactions}
            >
              Sync Ledger
            </Button>
          </div>
        </Card>

        {/* Smart Contract Card */}
        <Card className="p-6 flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">EscrowX Architecture</h4>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Autonomous milestone vault with escrow state stored in MongoDB and verified on-chain.
            </p>
            
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Network Target</span>
                <p className="font-bold text-slate-800">Ethereum Sepolia Testnet</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Supported Currency</span>
                <p className="font-bold text-slate-800">ERC-20 mINR (₹1 per token)</p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <a
              href="https://sepolia.etherscan.io"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center justify-between"
            >
              <span>View On Sepolia Explorer</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </Card>

      </div>

      {/* Transaction History Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Escrow Transaction History</h3>
            <p className="text-xs text-slate-500">Deposits, milestone releases, and dispute settlements from MongoDB</p>
          </div>
        </div>

        {loading ? (
          <Loading message="Syncing ledger..." />
        ) : transactions.length === 0 ? (
          <EmptyState
            title="No transactions yet."
            description="No transactions exist for this account yet. Transactions will appear here when you fund or release milestones."
            icon={History}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4">Project / Milestone</th>
                    <th className="py-3.5 px-4">Amount</th>
                    <th className="py-3.5 px-4">Transaction Reference</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((tx) => {
                    const isDeposit = tx.type === 'DEPOSIT';

                    return (
                      <tr key={tx._id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md ${
                            isDeposit ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {isDeposit ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-bold text-slate-800">{tx.projectTitle}</p>
                          <p className="text-[11px] text-slate-400">{tx.milestoneTitle || 'Escrow action'}</p>
                        </td>
                        <td className="py-4 px-4 font-extrabold text-slate-900">
                          {isDeposit ? '+' : '-'}₹{tx.amount}
                        </td>
                        <td className="py-4 px-4">
                          {tx.txHash ? (
                            <a
                              href={getEtherscanTxUrl(tx.txHash)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                            >
                              {shortenAddress(tx.txHash, 6)}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">Ledger Recorded</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px]">
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-400">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
