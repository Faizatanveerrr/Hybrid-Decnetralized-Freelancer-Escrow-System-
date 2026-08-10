import { ethers } from "ethers";
import EscrowAbi from "./EscrowJob.abi.json";
import Erc20Abi from "./erc20.abi.json";

// --- Network config ---------------------------------------------------
export const BASE_SEPOLIA_CHAIN_ID = 84532n;
export const BASE_SEPOLIA_CHAIN_ID_HEX = "0x14a34";
export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const USDC_DECIMALS = 6;

// Populate this with your main deployed contract, or leave blank and
// paste an address into the UI at runtime.
export const DEFAULT_ESCROW_ADDRESS =
  import.meta.env.VITE_DEPLOYED_ESCROW_ADDRESS ||
  "0xB2012dc47B963a6e5EDfaaDcf707ACA10edBFA58";

// Bytecode is required only for "Create Job" (deploying a new EscrowJob
// instance). Get it with:
//   vyper -f bytecode contracts/EscrowJob.vy
// and paste the 0x... output into a .env file as VITE_ESCROW_BYTECODE,
// or directly below. Left blank by default — Create Job will show an
// inline message instead of crashing if this isn't set.
export const ESCROW_BYTECODE = import.meta.env.VITE_ESCROW_BYTECODE || "";

export const STATUS = {
  0: { name: "PENDING", color: "state-pending" },
  1: { name: "FUNDED", color: "state-funded" },
  2: { name: "SUBMITTED", color: "state-submitted" },
  3: { name: "DISPUTED", color: "state-disputed" },
  4: { name: "RELEASED", color: "state-released" },
  5: { name: "REFUNDED", color: "state-refunded" },
  6: { name: "CANCELLED", color: "state-cancelled" },
};

// --- Wallet / provider --------------------------------------------------
export async function getProvider() {
  if (!window.ethereum) {
    throw new Error("No wallet found. Install MetaMask to continue.");
  }
  return new ethers.BrowserProvider(window.ethereum);
}

export async function connectWallet() {
  const provider = await getProvider();
  await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();
  if (network.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_SEPOLIA_CHAIN_ID_HEX }],
      });
    } catch (switchError) {
      // 4902 = chain not added to wallet yet
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: BASE_SEPOLIA_CHAIN_ID_HEX,
              chainName: "Base Sepolia",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://sepolia.base.org"],
              blockExplorerUrls: ["https://sepolia.basescan.org"],
            },
          ],
        });
      } else {
        throw switchError;
      }
    }
  }
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

export function escrowContract(addressOrEmpty, signerOrProvider) {
  // Lowercase before handing to ethers — an all-lowercase address always
  // passes ethers' validation (no checksum applied), sidestepping the
  // "bad address checksum" error that a mixed-case-but-wrong-checksum
  // string would trigger. Case doesn't affect which contract this
  // actually resolves to on-chain.
  return new ethers.Contract(addressOrEmpty?.toLowerCase() || "", EscrowAbi, signerOrProvider);
}

export function usdcContract(signerOrProvider) {
  return new ethers.Contract(USDC_ADDRESS.toLowerCase(), Erc20Abi, signerOrProvider);
}

// --- Formatting helpers ---------------------------------------------------
export function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatUsdc(raw) {
  try {
    return ethers.formatUnits(raw, USDC_DECIMALS);
  } catch {
    return "0";
  }
}

export function parseUsdc(amount) {
  return ethers.parseUnits(String(amount), USDC_DECIMALS);
}

export function explorerAddressUrl(addr) {
  return `https://sepolia.basescan.org/address/${addr}`;
}

export function explorerTxUrl(hash) {
  return `https://sepolia.basescan.org/tx/${hash}`;
}

// --- Transaction wrapper ---------------------------------------------------
// Browser-wallet transactions (MetaMask + a normal RPC) don't hit the
// Titanoboa-specific post-tx sync bug the Python scripts work around —
// that's specific to Titanoboa's local fork state. Here we still want a
// clear wait/confirm state for the UI, so this just standardizes that.
export async function sendTx(txPromise, { onHash, onConfirmed } = {}) {
  const tx = await txPromise;
  onHash?.(tx.hash);
  const receipt = await tx.wait();
  onConfirmed?.(receipt);
  return receipt;
}