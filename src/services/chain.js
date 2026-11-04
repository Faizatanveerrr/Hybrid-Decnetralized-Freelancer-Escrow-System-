/**
 * Browser side of the on-chain flow: talks to MetaMask and wraps the shared
 * chainCore functions so pages can do `await onchain.fund(project, milestone)`.
 */
import { BrowserProvider } from 'ethers';
import * as core from '../../shared/chainCore.js';
import { getChainConfigApi, chainTxApi } from './api.js';

let configPromise = null;

/** Server-provided chain settings (token, arbitrator, chain id...). Cached. */
export const loadChainConfig = () => {
  if (!configPromise) {
    configPromise = getChainConfigApi()
      .then((res) => res.data?.config || { enabled: false })
      .catch(() => {
        configPromise = null; // allow retry
        return { enabled: false };
      });
  }
  return configPromise;
};

export const explorerTx = (config, txHash) => (txHash ? `${config?.explorerUrl || 'https://sepolia.etherscan.io'}/tx/${txHash}` : '');
export const explorerAddress = (config, address) => (address ? `${config?.explorerUrl || 'https://sepolia.etherscan.io'}/address/${address}` : '');

const SEPOLIA = {
  chainId: '0xaa36a7',
  chainName: 'Sepolia',
  nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
  blockExplorerUrls: ['https://sepolia.etherscan.io']
};

const ensureNetwork = async (config) => {
  const wanted = '0x' + Number(config.chainId).toString(16);
  const current = await window.ethereum.request({ method: 'eth_chainId' });
  if (current?.toLowerCase() === wanted) return;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: wanted }] });
  } catch (err) {
    if (err?.code === 4902 && wanted === SEPOLIA.chainId) {
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [SEPOLIA] });
    } else {
      throw new Error(`Please switch MetaMask to the configured network (chain id ${config.chainId}).`);
    }
  }
};

/**
 * Connected MetaMask signer on the right network. If `expectedAddress` is
 * given, the active account must match it (the account registered in the app).
 */
export const getSigner = async (expectedAddress) => {
  if (!window.ethereum) throw new Error('MetaMask is not installed.');
  const config = await loadChainConfig();
  if (!config.enabled) throw new Error('On-chain mode is not configured on the server.');
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  await ensureNetwork(config);
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  await core.assertSigner(signer, expectedAddress);
  return { signer, provider, config };
};

const idx = (milestone) => {
  if (milestone.chainIndex == null || milestone.chainIndex < 0) throw new Error('This milestone is not linked to an escrow contract.');
  return milestone.chainIndex;
};

const isManaged = (user) => user?.walletType === 'managed';

/** Managed wallets: the server signs with the user's encrypted key. */
const viaServer = async (action, body = {}) => {
  try {
    return (await chainTxApi({ action, ...body })).data;
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message);
  }
};

/** Toast text while a transaction is in progress. */
export const txPrompt = (user, what) =>
  isManaged(user) ? `Sending ${what} on the blockchain...` : `Confirm ${what} in MetaMask...`;

export const onchain = {
  async deployEscrow(project, user) {
    if (isManaged(user)) return viaServer('deploy', { projectId: project._id });
    const { signer, config } = await getSigner(user.walletAddress);
    const result = await core.deployEscrow(signer, {
      freelancer: project.freelancerWallet,
      arbitrator: config.arbitratorAddress,
      token: config.tokenAddress,
      reviewPeriod: config.reviewPeriod,
      appealWindow: config.appealWindow,
      specUri: `escrowx://project/${project._id}`,
      milestones: (project.milestones || []).map((m) => ({ amount: m.amount }))
    });
    return result;
  },
  async fund(project, milestone, user) {
    if (isManaged(user)) return viaServer('fund', { projectId: project._id, milestoneId: milestone._id });
    const { signer, config } = await getSigner(user.walletAddress);
    return core.fundMilestone(signer, project.escrowAddress, config.tokenAddress, idx(milestone));
  },
  async submit(project, milestone, user, proof) {
    if (isManaged(user)) return viaServer('submit', { projectId: project._id, milestoneId: milestone._id, proof });
    const { signer } = await getSigner(user.walletAddress);
    return core.submitMilestone(signer, project.escrowAddress, idx(milestone), proof || 'deliverables');
  },
  async approve(project, milestone, user) {
    if (isManaged(user)) return viaServer('approve', { projectId: project._id, milestoneId: milestone._id });
    const { signer } = await getSigner(user.walletAddress);
    return core.approveMilestone(signer, project.escrowAddress, idx(milestone));
  },
  async claimTimeout(project, milestone, user) {
    if (isManaged(user)) return viaServer('claimTimeout', { projectId: project._id, milestoneId: milestone._id });
    const { signer } = await getSigner(user.walletAddress);
    return core.claimAfterTimeout(signer, project.escrowAddress, idx(milestone));
  },
  async raiseDispute(project, milestone, user, evidenceUri) {
    if (isManaged(user)) return viaServer('raiseDispute', { projectId: project._id, milestoneId: milestone._id, evidence: evidenceUri });
    const { signer } = await getSigner(user.walletAddress);
    return core.raiseDispute(signer, project.escrowAddress, idx(milestone), evidenceUri || 'dispute');
  },
  async appeal(project, milestone, user) {
    if (isManaged(user)) return viaServer('appeal', { projectId: project._id, milestoneId: milestone._id });
    const { signer } = await getSigner(user.walletAddress);
    return core.appealRuling(signer, project.escrowAddress, idx(milestone));
  },
  async finalize(project, milestone, user) {
    if (isManaged(user)) return viaServer('finalize', { projectId: project._id, milestoneId: milestone._id });
    const { signer } = await getSigner(user.walletAddress);
    return core.finalizeRuling(signer, project.escrowAddress, idx(milestone));
  },
  /** MetaMask users: send tokens to the platform treasury (managed wallets are handled server-side). */
  async sendToTreasury(user, treasuryAddress, amount) {
    const { signer, config } = await getSigner(user.walletAddress);
    return core.transferInr(signer, config.tokenAddress, treasuryAddress, amount);
  },
  async faucet(user) {
    if (isManaged(user)) return viaServer('faucet');
    const { signer, config } = await getSigner(user?.walletAddress);
    return core.claimFaucet(signer, config.tokenAddress);
  }
};

export const chainError = core.friendlyChainError;
