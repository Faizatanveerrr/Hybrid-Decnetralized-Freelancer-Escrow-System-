/**
 * Web3 & MetaMask Frontend Service
 * Handles browser wallet connections via window.ethereum without fake wallet fallbacks.
 */

export const isMetaMaskInstalled = () => {
  return typeof window !== 'undefined' && Boolean(window.ethereum && window.ethereum.isMetaMask);
};

export const connectBrowserWallet = async () => {
  if (isMetaMaskInstalled()) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        return {
          success: false,
          error: 'No accounts found in connected wallet.'
        };
      }
      const address = accounts[0];
      let network = 'Ethereum';
      try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (chainId === '0xaa36a7' || chainId === '11155111') network = 'Sepolia Testnet';
        else if (chainId === '0x1') network = 'Ethereum Mainnet';
        else network = `Chain ID: ${parseInt(chainId, 16) || chainId}`;
      } catch (e) {
        // network detection fallback
      }
      return {
        success: true,
        address,
        isMetaMask: true,
        network
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'User rejected wallet connection.'
      };
    }
  }

  return {
    success: false,
    error: 'MetaMask is not installed. Please install MetaMask or use a Web3 browser extension.'
  };
};

export const shortenAddress = (address, chars = 4) => {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
};

export const getEtherscanTxUrl = (txHash) => {
  if (!txHash) return '#';
  return `https://sepolia.etherscan.io/tx/${txHash}`;
};
