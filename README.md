# 🔐 Decentralized Freelancer Escrow System — Project Status

> **Last updated:** August 2026
> **Purpose:** Full handoff summary so anyone (or their AI assistant) can understand what's built, what's tested, what's live, and what's left to do.

---

## 📑 Table of Contents

1. [Project Goal](#1-project-goal)
2. [Final Tech Stack](#2-final-tech-stack)
3. [What's Been Built](#3-whats-been-built-all-tested-andor-verified-live)
4. [Project File Structure](#4-project-file-structure)
5. [Environment Setup](#5-environment-setup-for-a-fresh-machine)
6. [Accounts / Services](#6-accounts--services-set-up)
7. [What's Not Built Yet](#7-whats-not-built-yet-next-steps)
8. [Key Learnings / Gotchas](#8-key-learnings--gotchas-useful-context-for-troubleshooting)

---

## 1. Project Goal

A blockchain-based escrow system for freelance payments, using milestone-based smart contracts with AI-assisted dispute resolution.

**Core flow:**

| Step | What Happens |
|---|---|
| 💰 Fund | Client deposits payment (USDC) into a smart contract per milestone |
| 📤 Submit | Freelancer submits proof of work (stored on IPFS) |
| ✅ Approve | Client approves → instant payment release |
| ⏱️ Timeout | If client goes silent → automatic payment release after a review period (protects freelancer) |
| ⚖️ Dispute | If either party disputes → an off-chain AI arbitrator rules, with a confidence-based appeal/secondary-review system |

---

## 2. Final Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Smart contract language | Vyper 0.4.3 | |
| Local testing framework | Titanoboa 0.2.8 | In-memory EVM simulator |
| Deployment tooling | Ape Framework 0.8.50 | Installed but not used directly — Titanoboa's `set_network_env` was used instead |
| Testing | pytest 8.4.2 | |
| Blockchain (testnet) | Base Sepolia | Ethereum L2 testnet |
| Payment token | USDC (testnet) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` — Circle's official Base Sepolia USDC |
| RPC provider | Alchemy | Free tier |
| Wallet | MetaMask | |
| Decentralized storage | IPFS via Pinata | Free tier |
| AI arbitration model | Amazon Nova Lite | Via AWS Bedrock |
| Frontend | React.js + Tailwind CSS | 🚧 Planned, not built |
| Backend | Node.js/Express + Python (AI module) | 🚧 Planned, not built |
| Off-chain metadata DB | MongoDB | 🚧 Planned, not built |

> **Note on tooling choice:** Vyper was intentionally kept instead of switching to Solidity + Hardhat. Hardhat doesn't properly support Vyper; Ape Framework + Titanoboa are the correct Vyper-native equivalent, and 45 tests were already passing before this was reconsidered.

---

## 3. What's Been Built (all tested and/or verified live)

### 3.1 Smart Contracts

**`contracts/EscrowJob.vy`** — the core contract. One deployed per client–freelancer job, supports multiple milestones internally (up to 20).

**Milestone lifecycle:**

```
PENDING → FUNDED → SUBMITTED → RELEASED
                        │            ↑
                        ▼            │
                    DISPUTED ────────┘──→ REFUNDED

(PENDING/FUNDED → CANCELLED before submission)
```

**Key functions:**

| Function | Role | Purpose |
|---|---|---|
| `fund_milestone()` | Client | Deposits USDC for a milestone |
| `submit_milestone()` | Freelancer | Submits IPFS proof URI |
| `approve_milestone()` | Client | Approves, instant payout |
| `claim_after_timeout()` | Anyone | Triggers payout if client goes silent past the review period |
| `cancel_milestone()` | Client | Cancels before submission; refunded if already funded |
| `raise_dispute()` | Client / Freelancer | Disputes a submitted milestone |
| `submit_ruling()` | Arbitrator (AI) | Submits ruling: winner + confidence (0–100) + IPFS reasoning link |
| `appeal_ruling()` | Client / Freelancer | Appeals a high-confidence ruling within the appeal window |
| `submit_secondary_ruling()` | Arbitrator (AI) | Final, binding ruling — pays out immediately |
| `finalize_ruling()` | Anyone | Executes an unappealed, high-confidence ruling once the window closes |

**Confidence routing:** ≥70 → opens a 3-day appeal window · <70 → automatically forced into secondary review

**Other contracts:**

| File | Purpose | Status |
|---|---|---|
| `contracts/MockUSDC.vy` | Fake USDC for local testing only (has `mint()`) | Not used on testnet/production |
| `contracts/HelloEscrow.vy` | Throwaway toolchain sanity check | Safe to ignore/delete |
| `contracts/EscrowJobFastTest.vy` | Same as `EscrowJob.vy` but 60s appeal window instead of 3 days | Throwaway — proves `finalize_ruling()` live without a real 3-day wait |

### 3.2 Tests

| Suite | Tests | Covers |
|---|---|---|
| `tests/test_smoke.py` | 4 | Toolchain verification |
| `tests/test_escrow.py` | 22 | Core milestone lifecycle — funding, submission, approval, auto-release timeout, cancellation/refunds, access control, multi-milestone independence |
| `tests/test_dispute.py` | 19 | Full dispute/arbitration flow — raising disputes, primary rulings, confidence-threshold routing, appeals, secondary rulings, finalization |

**✅ Total: 45/45 tests passing** — run with `pytest` (from project root, venv activated)

### 3.3 IPFS Integration

**`scripts/ipfs_client.py`** — uploads files to IPFS via Pinata, returns a CID.

| Function | Returns |
|---|---|
| `upload_file(filepath)` | CID |
| `upload_json(dict)` | CID (structured data, e.g. AI arbitration reasoning) |
| `get_gateway_url(cid)` | Viewable URL |

**✅ Confirmed working** — test file uploaded and retrieved:
`https://gateway.pinata.cloud/ipfs/QmS1HNL3yGBAxNE7e21irDCS7iiNBVPiA5U5dBFvJjWm21`

Requires `.env`: `PINATA_JWT=your_jwt_here`

### 3.4 Live Testnet Deployment

**✅ Deployed and live on Base Sepolia:**

```
Contract address:  0xB2012dc47b963a6e5edfaadcf707aca10edbfa58
BaseScan:          https://sepolia.basescan.org/address/0xB2012dc47b963a6e5edfaadcf707aca10edbfa58
```

| Parameter | Value |
|---|---|
| Client (deployer) | `0xc98788b1BB17ff393dfa7Cb591bBB191b12052A8` |
| Freelancer (test) | `0x198702b4fBCc6f0eF9838Be156696C1BfE012a8F` |
| Arbitrator (test) | `0x0BBDa4361Eb1DA3156cB7f580Bffbe3A52458E81` |
| Token | Base Sepolia USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) |
| Review period | 7 days |
| Milestones | 10 USDC, 20 USDC (test amounts) |

**`scripts/deploy_testnet.py`** — takes freelancer and arbitrator addresses as CLI args, deploys via Titanoboa's `set_network_env()` + Alchemy RPC + private key from `.env`.

### 3.5 AI Arbitration — Fully Proven Live

The complete dispute resolution pipeline has been executed **live on Base Sepolia**, with every contract function in the arbitration flow verified against real, public blockchain state (not just local simulated tests).

**Scenario A — main contract** (`0xB2012dc47b963a6e5edfaadcf707aca10edbfa58`, milestone 0):

1. Client funded milestone with real testnet USDC
2. Freelancer submitted proof (uploaded to IPFS)
3. Client raised a dispute
4. `scripts/ai_arbitrate.py` — Amazon Nova Lite (AWS Bedrock) evaluated the real IPFS evidence against the acceptance criteria, identified the submission was intentionally incomplete, and ruled for the client at **95% confidence**
5. Freelancer appealed (`appeal_ruling()`)
6. Arbitrator submitted a secondary, final ruling (`submit_secondary_ruling()`) upholding the original decision
7. **Final status: `REFUNDED`** — client refunded automatically

**Scenario B — fast-test contract** (`0xe0BE70ef3949383157205416B2edCF8cFDd0Dc89`, 60s appeal window):

1. Funded → submitted → disputed → high-confidence ruling issued (freelancer wins, **85% confidence**)
2. Appeal window closed with no appeal filed
3. `finalize_ruling()` called → freelancer paid automatically
4. **✅ Confirmed:** freelancer's real USDC balance increased by exactly **1.0 USDC**

**Verification matrix:**

| Function | Verified Live |
|---|:---:|
| `raise_dispute()` | ✅ |
| `submit_ruling()` | ✅ |
| `appeal_ruling()` | ✅ |
| `submit_secondary_ruling()` | ✅ |
| `finalize_ruling()` | ✅ |

**New scripts added:**

| Script | Purpose |
|---|---|
| `scripts/ai_arbitrate.py` | Fetches disputed milestone evidence from IPFS, calls Nova Lite for a ruling, uploads reasoning to IPFS, submits ruling on-chain |
| `scripts/testnet_flow.py` | Funds a milestone, submits proof, raises a dispute on the live contract |
| `scripts/appeal_dispute.py` | Appeals the current ruling on milestone 0, as the freelancer |
| `scripts/submit_secondary_ruling.py` | Submits a final, binding secondary ruling |
| `scripts/deploy_fast_test.py` | Deploys the throwaway fast-test contract variant |
| `scripts/fast_test_flow.py` | Full automated flow including waiting out the appeal window and calling `finalize_ruling()` |
| `scripts/check_milestone.py`, `check_usdc.py`, `check_freelancer_balance.py` | Utility scripts for checking on-chain state |

**AI provider:** Amazon Nova Lite via AWS Bedrock (not Anthropic/OpenAI — existing AWS IAM credentials were already available). Uses Bedrock's `converse()` API. Model ID configurable via `.env` (`NOVA_MODEL_ID`, default `us.amazon.nova-lite-v1:0`).

> **⚠️ Known quirk — harmless post-transaction error:** Every real transaction on this RPC setup (Alchemy free tier + Titanoboa) throws `TypeError: 'NoneType' object is not subscriptable` immediately **after** the transaction has already succeeded and been mined. Titanoboa tries to re-sync its internal state right after broadcasting, and the RPC hasn't indexed the latest block yet — a timing/race condition, not a real failure. Confirmed repeatedly via BaseScan that the underlying transaction always succeeded. Multi-step scripts (`fast_test_flow.py`) wrap each call in a retry-with-delay helper; simpler one-off scripts just need to be re-run if this error appears.

**Contract addresses reference:**

```
Main contract:       0xB2012dc47b963a6e5edfaadcf707aca10edbfa58
Fast-test contract:  0xe0BE70ef3949383157205416B2edCF8cFDd0Dc89  (throwaway, 60s appeal window — DO NOT use for anything real)
```

---

## 4. Project File Structure

```
escrow-system-starter/
├── contracts/
│   ├── EscrowJob.vy              ← the real escrow contract
│   ├── MockUSDC.vy               ← test-only fake USDC
│   ├── HelloEscrow.vy            ← throwaway toolchain test, safe to ignore
│   └── EscrowJobFastTest.vy      ← throwaway 60s-appeal-window test variant
├── tests/
│   ├── test_smoke.py
│   ├── test_escrow.py
│   └── test_dispute.py
├── scripts/
│   ├── ipfs_client.py                  ← Pinata/IPFS upload helper
│   ├── deploy_testnet.py               ← deploys EscrowJob.vy to Base Sepolia
│   ├── deploy_fast_test.py             ← deploys the fast-test variant
│   ├── testnet_flow.py                 ← fund → submit → dispute on the live contract
│   ├── ai_arbitrate.py                 ← AI arbitration: fetches evidence, calls Nova Lite, submits ruling
│   ├── appeal_dispute.py               ← appeals a ruling as the freelancer
│   ├── submit_secondary_ruling.py      ← submits final binding ruling
│   ├── fast_test_flow.py               ← full automated flow incl. finalize_ruling()
│   ├── check_milestone.py              ← on-chain milestone state checker
│   ├── check_usdc.py                   ← client USDC balance checker
│   └── check_freelancer_balance.py     ← freelancer USDC balance checker
├── .env                      ← SECRETS, never commit (see below)
├── .gitignore                ← protects .env from being committed
├── requirements.txt
├── pytest.ini
└── README.md
```

**`.env` file contents needed** (fill in your own values, never share these):

```env
PINATA_JWT=...
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/...
DEPLOYER_PRIVATE_KEY=...
FREELANCER_PRIVATE_KEY=...
ARBITRATOR_PRIVATE_KEY=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
DEPLOYED_ESCROW_ADDRESS=0xB2012dc47b963a6e5edfaadcf707aca10edbfa58
DEPLOYED_FASTTEST_ADDRESS=0xe0BE70ef3949383157205416B2edCF8cFDd0Dc89
```

---

## 5. Environment Setup (for a fresh machine)

```powershell
# 1. Create and activate virtual environment
python -m venv venv
venv\Scripts\Activate.ps1        # PowerShell (recommended over cmd)

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run tests to confirm everything works
pytest
# Expected: 45 passed
```

**Important environment notes learned along the way:**

- Use **PowerShell**, not Command Prompt — some commands (`mkdir -p`, `Get-Content`) only work in PowerShell
- Always confirm `(venv)` appears in the prompt before running `pip install`, or packages install system-wide instead of in the isolated environment
- Vyper 0.4.3 requires exact syntax — copy-paste carefully; a single truncated string in a long file will break compilation (happened once with `EscrowJob.vy`, fixed by checking the file's tail with `Get-Content -Tail`)
- Real transactions sometimes throw a harmless error immediately after succeeding (see §3.5) — if a script crashes right after "tx broadcasted... mined in block...", the transaction almost certainly succeeded; check on-chain state before assuming failure

---

## 6. Accounts / Services Set Up

| Service | Purpose | Status |
|---|---|:---:|
| MetaMask | Wallet — 3 test accounts (deployer, freelancer-test, arbitrator-test) | ✅ |
| Alchemy | RPC provider for Base Sepolia | ✅ *(watch out: easy to accidentally create a Mainnet app instead of Sepolia — happened once, had to redo)* |
| Pinata | IPFS file storage | ✅ Confirmed working |
| Base Sepolia faucet | Free testnet ETH | ✅ Used (Coinbase Developer Platform + Alchemy faucets) |
| Circle USDC faucet | Free testnet USDC | ✅ Used (faucet.circle.com) |
| AWS Bedrock | Amazon Nova Lite access for AI arbitration | ✅ Confirmed working |

---

## 7. What's NOT Built Yet (next steps)

> **Note:** AI arbitration — previously the top priority — is now complete and proven live (§3.5). `ai_arbitrate.py` is currently manually triggered; a production version would add automatic event-watching for `DisputeRaised` instead of an operator running the script by hand.

### 7.1 Frontend 🚧
- React + Tailwind CSS UI for clients/freelancers to interact with the contract (create jobs, fund milestones, submit work, approve, raise disputes) without running Python scripts manually
- Needs Ethers.js/Wagmi + MetaMask connection

### 7.2 Backend API 🚧
- Node.js/Express layer connecting frontend ↔ contract ↔ AI arbitration service
- MongoDB for off-chain metadata (job descriptions, user profiles, etc. — anything that doesn't need to be on-chain)

### 7.3 More testnet testing — mostly done ✅
The full fund → submit → approve/dispute → AI ruling → appeal → secondary ruling → finalize flow has been proven live (§3.5). Remaining gaps: the "happy path" (client approves without disputing) and `claim_after_timeout()` (client goes silent, freelancer auto-paid after the review period) haven't been specifically exercised live yet — though both are covered by the 45 local automated tests.

### 7.4 Eventually: Mainnet deployment 🚧
- Real money, real USDC, real gas fees — a much later step after thorough testing and possibly a security audit

---

## 8. Key Learnings / Gotchas (useful context for troubleshooting)

- Vyper + Ape/Titanoboa was chosen over Solidity + Hardhat because the methodology specified Vyper, and Hardhat doesn't properly support it
- Base Sepolia was chosen over Ethereum Sepolia or zkSync for lower fees and simpler tooling compatibility
- Alchemy apps must be explicitly created for **Sepolia**, not Mainnet — the network selector is easy to misclick
- Testnet ETH faucets often give tiny amounts per request (e.g. 0.0001 ETH) — may need multiple requests to accumulate enough for a contract deployment
- Real transactions on this RPC setup consistently throw a harmless `TypeError` immediately **after** succeeding (a timing/race condition between Titanoboa's post-transaction state sync and the RPC indexing the latest block) — confirmed repeatedly via BaseScan that the underlying transaction always succeeded regardless of this error
- When automating multi-step flows, wrap each transaction in retry logic rather than assuming failure on this error — see `fast_test_flow.py` for the pattern used