"""
timeout_claim_flow.py

Live test of claim_after_timeout(): client funds a milestone, freelancer
submits proof, client goes silent, and after the review period passes,
the freelancer calls claim_after_timeout() to trigger automatic payout.

Runs against the throwaway short-review-period contract deployed by
deploy_fast_timeout.py — NOT the main contract (its 7-day period makes
that impractical to test live).

Usage:
    python scripts/timeout_claim_flow.py

Exception handling for this project's known Alchemy/Titanoboa RPC-lag
quirk lives in chain_utils.py (run_tx for writes, read_view for reads).
"""

import os
import time
import json
from dotenv import load_dotenv
from eth_account import Account
import boa

from chain_utils import run_tx, read_view

load_dotenv()

RPC_URL = os.environ["BASE_SEPOLIA_RPC_URL"]
ESCROW_ADDRESS = os.environ["DEPLOYED_TIMEOUTTEST_ADDRESS"]  # from deploy_fast_timeout.py
MILESTONE_INDEX = 0

DEPLOYER_KEY = os.environ["DEPLOYER_PRIVATE_KEY"]      # client (goes silent)
FREELANCER_KEY = os.environ["FREELANCER_PRIVATE_KEY"]  # freelancer (claims)

MILESTONE_AMOUNT_USDC = 1 * 10**6  # small test amount, 6 decimals
REVIEW_PERIOD_SECONDS = 60
BUFFER_SECONDS = 15  # extra wait to be safely past the deadline on-chain

USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"  # Base Sepolia USDC
USDC_ABI = [
    {
        "name": "approve",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "outputs": [{"name": "", "type": "bool"}],
    },
]

STATUS_NAMES = {0: "PENDING", 1: "FUNDED", 2: "SUBMITTED", 3: "DISPUTED",
                 4: "RELEASED", 5: "REFUNDED", 6: "CANCELLED"}


def main():
    boa.set_network_env(RPC_URL)

    deployer_account = Account.from_key(DEPLOYER_KEY)
    freelancer_account = Account.from_key(FREELANCER_KEY)
    boa.env.add_account(deployer_account)
    boa.env.add_account(freelancer_account)

    escrow = boa.load_partial("contracts/EscrowJob.vy").at(ESCROW_ADDRESS)
    usdc = boa.loads_abi(json.dumps(USDC_ABI)).at(USDC_ADDRESS)

    # 0. Client approves the escrow contract to pull USDC.
    print(f"Approving escrow contract to spend {MILESTONE_AMOUNT_USDC / 1e6} USDC...")
    with boa.env.prank(deployer_account.address):
        run_tx(usdc.approve, ESCROW_ADDRESS, MILESTONE_AMOUNT_USDC)
    print("  -> approved.")

    # 1. Fund
    print(f"Funding milestone {MILESTONE_INDEX} ({MILESTONE_AMOUNT_USDC / 1e6} USDC)...")
    with boa.env.prank(deployer_account.address):
        run_tx(escrow.fund_milestone, MILESTONE_INDEX)
    print("  -> funded.")

    # 2. Submit
    proof_uri = "ipfs://QmS1HNL3yGBAxNE7e21irDCS7iiNBVPiA5U5dBFvJjWm21"
    print(f"Submitting proof: {proof_uri}")
    with boa.env.prank(freelancer_account.address):
        run_tx(escrow.submit_milestone, MILESTONE_INDEX, proof_uri)
    print("  -> submitted.")

    # 3. Client goes silent — wait out the review period
    wait_time = REVIEW_PERIOD_SECONDS + BUFFER_SECONDS
    print(f"Client going silent. Waiting {wait_time}s for review period to elapse...")
    time.sleep(wait_time)

    # 4. Freelancer claims
    print("Calling claim_after_timeout()...")
    with boa.env.prank(freelancer_account.address):
        run_tx(escrow.claim_after_timeout, MILESTONE_INDEX)
    print("  -> claimed, payout released.")

    # 5. Confirm state + balance — READ call, safe to retry via read_view
    milestone = read_view(escrow.milestones, MILESTONE_INDEX)
    status = milestone[1]
    print(f"\nFinal milestone {MILESTONE_INDEX} status: {status} "
          f"({STATUS_NAMES.get(status, 'UNKNOWN')})")
    print("Expected: 4 (RELEASED)")
    print("\nCross-check freelancer's USDC balance with check_freelancer_balance.py")
    print("(should have increased by exactly 1.0 USDC)")


if __name__ == "__main__":
    main()