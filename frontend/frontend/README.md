# Escrow Frontend

React + Vite + Tailwind + ethers.js UI for the Decentralized Freelancer
Escrow System (Base Sepolia).

## ⚠️ Do this first — verify the ABI

The ABI at `src/lib/EscrowJob.abi.json` was reconstructed from function
signatures confirmed live via testing (see `PROJECT_STATUS.md` §3.4–3.6),
**not** exported directly from your contract. A few parts are best-guesses:
`raise_dispute()`, `submit_ruling()`, and `submit_secondary_ruling()`
argument lists specifically haven't been directly confirmed the way
`fund_milestone` / `submit_milestone` / `approve_milestone` /
`claim_after_timeout` / the constructor have.

Regenerate it from the real contract before relying on this for anything
beyond local dev:

```powershell
vyper -f abi contracts/EscrowJob.vy > frontend/src/lib/EscrowJob.abi.json
```

This is exactly the same mismatch class that caused the constructor
argument-order bug during live testing (§3.6) — cheaper to fix once here
than to debug through a wallet confirmation dialog.

## Setup

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Opens on `http://localhost:5173`. Needs MetaMask (or another injected
wallet) with a Base Sepolia account funded via the faucets already in
your `.env` workflow (`faucet.circle.com` for USDC, Alchemy/Coinbase
faucets for ETH gas).

## What's here

| File | Purpose |
|---|---|
| `src/App.jsx` | Main dashboard — wallet state, contract reads/writes, milestone selector |
| `src/components/MilestoneStepper.jsx` | Visualizes the milestone lifecycle as a branching diagram (main line + dispute branch), matching the contract's actual state machine |
| `src/components/MilestoneActions.jsx` | Shows only the actions valid for the current milestone status AND the connected wallet's role (client/freelancer/arbitrator) |
| `src/components/CreateJobPanel.jsx` | Deploys a new `EscrowJob` instance (needs bytecode — see `.env.example`) |
| `src/components/WalletBar.jsx` | Connect wallet, auto-switches/adds Base Sepolia network |
| `src/components/TxLog.jsx` | Recent transaction log with BaseScan links |
| `src/lib/chain.js` | ethers.js setup, formatting helpers, network config |
| `src/lib/EscrowJob.abi.json` | Contract ABI — **regenerate this, see warning above** |
| `src/lib/erc20.abi.json` | Minimal ERC20 ABI for USDC `approve`/`allowance` |

## Design notes

Dark, technical palette (near-black surfaces, Base blue `#0052FF` accent)
with distinct colors per milestone status (amber = funded, blue =
submitted, red = disputed, green = released, violet = refunded) used
consistently across the stepper, status badges, and text. Space Grotesk
for headings, IBM Plex Sans for body text, IBM Plex Mono for addresses,
hashes, and on-chain values — same type pairing as your portfolio site.

The milestone stepper is deliberately **not** a generic linear progress
bar: it branches to mirror the contract's real state machine (submitted
work resolves either by direct approval or by the dispute/arbitration
path), so the diagram teaches the actual mechanics rather than decorating
a checklist.

## Known gaps / next steps

- `raise_dispute()`, `submit_ruling()`, `submit_secondary_ruling()` params
  are unverified guesses — confirm against the regenerated ABI
- Arbitrator ruling submission is intentionally left to `ai_arbitrate.py`
  rather than exposed in the UI, so the AI evaluation stays server-side
- No mobile-specific testing done yet, though layout is responsive down
  to a single column
- `Create Job` needs `VITE_ESCROW_BYTECODE` set — see `.env.example`
