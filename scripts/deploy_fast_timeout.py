"""
deploy_fast_timeout.py

Deploys a THROWAWAY instance of the real EscrowJob.vy contract (review_period
is a constructor argument, so no separate .vy file is needed) with a short
review period so claim_after_timeout() can be exercised live without
waiting 7 real days.

Confirmed live constructor order:
    __init__(freelancer, token, arbitrator, review_period, milestone_amounts)

Usage:
    python scripts/deploy_fast_timeout.py <freelancer_address> <arbitrator_address>

Prints the deployed address — add it to .env as DEPLOYED_TIMEOUTTEST_ADDRESS.

Exception handling for this project's known Alchemy/Titanoboa RPC-lag
quirk lives in chain_utils.py (deploy_with_recovery specifically handles
the deploy-call case, recovering the address via the tx receipt).
"""

import os
import sys
from dotenv import load_dotenv
from eth_account import Account
import boa

from chain_utils import deploy_with_recovery

load_dotenv()

RPC_URL = os.environ["BASE_SEPOLIA_RPC_URL"]
DEPLOYER_KEY = os.environ["DEPLOYER_PRIVATE_KEY"]
USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"  # Base Sepolia USDC

SHORT_REVIEW_PERIOD_SECONDS = 60  # vs. 7 days on the main contract
MILESTONE_AMOUNTS = [1 * 10**6]  # single 1 USDC test milestone, 6 decimals


def main():
    if len(sys.argv) != 3:
        print("Usage: python scripts/deploy_fast_timeout.py <freelancer_addr> <arbitrator_addr>")
        sys.exit(1)

    freelancer_addr = sys.argv[1]
    arbitrator_addr = sys.argv[2]

    boa.set_network_env(RPC_URL)

    deployer_account = Account.from_key(DEPLOYER_KEY)
    boa.env.add_account(deployer_account)

    with boa.env.prank(deployer_account.address):
        escrow = deploy_with_recovery(
            RPC_URL,
            "contracts/EscrowJob.vy",
            freelancer_addr,
            USDC_ADDRESS,
            arbitrator_addr,
            SHORT_REVIEW_PERIOD_SECONDS,
            MILESTONE_AMOUNTS,
        )

    print(f"Deployed throwaway timeout-test contract at: {escrow.address}")
    print(f"Review period: {SHORT_REVIEW_PERIOD_SECONDS}s")
    print("\nAdd this to your .env:")
    print(f"DEPLOYED_TIMEOUTTEST_ADDRESS={escrow.address}")
    print("\n⚠️  Throwaway contract — do not use for anything real.")


if __name__ == "__main__":
    main()