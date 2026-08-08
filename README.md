# Decentralized Freelancer Escrow System

## Environment

- Python 3.12
- Vyper 0.4.3
- Titanoboa 0.2.8 (fast local testing via in-memory EVM, no need to run a node)
- Ape Framework 0.8.50 (for testnet/L2 deployment later)
- pytest 8.4.2

## Setup

```bash
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

## Run tests

```bash
./venv/bin/pytest
```

## Project structure

```
contracts/    Vyper smart contracts
interfaces/   Vyper interface (.vyi) files, e.g. for IERC20
tests/        pytest + titanoboa tests
scripts/      deployment scripts (Ape)
```

## Status

- [x] Toolchain installed and verified (compile + deploy + test smoke test passing)
- [ ] Core escrow contract (job creation, funding, milestones)
- [ ] Submission + approval + auto-release logic
- [ ] Dispute + AI arbitration hooks
- [ ] Access control hardening
- [ ] Testnet deployment (Ape)
- [ ] Layer-2 deployment (Base / zkSync)
