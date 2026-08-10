"""
happy_path_flow.py

Live test of the "happy path": client funds a milestone, freelancer submits
proof, client approves directly (no dispute). Runs on the MAIN deployed
contract using milestone 1 (20 USDC).

Usage:
    python scripts/happy_path_flow.py

Exception handling for this project's known Alchemy/Titanoboa RPC-lag
quirk lives in chain_utils.py (run_tx for writes, read_view for reads) —
see that file's docstring for why writes and reads need different handling.
"""

import os
import json
from dotenv import load_dotenv
from eth_account import Account
import boa

from chain_utils import run_tx, read_view

load_dotenv()

# --- Config ---------------------------------------------------------------
RPC_URL = os.environ["BASE_SEPOLIA_RPC_URL"]
ESCROW_ADDRESS = os.environ["DEPLOYED_ESCROW_ADDRESS"]  # main contract
MILESTONE_INDEX = 1  # the 20 USDC milestone

DEPLOYER_KEY = os.environ["DEPLOYER_PRIVATE_KEY"]        # client
FREELANCER_KEY = os.environ["FREELANCER_PRIVATE_KEY"]    # freelancer

MILESTONE_AMOUNT_USDC = 20 * 10**6  # USDC has 6 decimals

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

    # Register both accounts so boa can sign with their keys, then prank
    # with the ADDRESS (not the private key) to select sender.
    deployer_account = Account.from_key(DEPLOYER_KEY)
    freelancer_account = Account.from_key(FREELANCER_KEY)
    boa.env.add_account(deployer_account)
    boa.env.add_account(freelancer_account)

    escrow = boa.load_partial("contracts/EscrowJob.vy").at(ESCROW_ADDRESS)
    usdc = boa.loads_abi(json.dumps(USDC_ABI)).at(USDC_ADDRESS)

    # 0. Client approves the escrow contract to pull USDC on its behalf.
    print(f"Approving escrow contract to spend {MILESTONE_AMOUNT_USDC / 1e6} USDC...")
    with boa.env.prank(deployer_account.address):
        run_tx(usdc.approve, ESCROW_ADDRESS, MILESTONE_AMOUNT_USDC)
    print("  -> approved.")

    # 1. Client funds milestone 1
    print(f"Funding milestone {MILESTONE_INDEX} ({MILESTONE_AMOUNT_USDC / 1e6} USDC)...")
    with boa.env.prank(deployer_account.address):
        run_tx(escrow.fund_milestone, MILESTONE_INDEX)
    print("  -> funded.")

    # 2. Freelancer submits proof
    proof_uri = os.environ.get(
        "HAPPY_PATH_PROOF_URI",
        "ipfs://QmS1HNL3yGBAxNE7e21irDCS7iiNBVPiA5U5dBFvJjWm21"
    )
    print(f"Submitting proof: {proof_uri}")
    with boa.env.prank(freelancer_account.address):
        run_tx(escrow.submit_milestone, MILESTONE_INDEX, proof_uri)
    print("  -> submitted.")

    # 3. Client approves directly — no dispute
    print("Client approving milestone (happy path, no dispute)...")
    with boa.env.prank(deployer_account.address):
        run_tx(escrow.approve_milestone, MILESTONE_INDEX)
    print("  -> approved, payout released.")

    # 4. Confirm final state — this is a READ, so retrying is safe here
    #    (unlike the writes above), which is exactly what read_view does.
    milestone = read_view(escrow.milestones, MILESTONE_INDEX)
    status = milestone[1]
    print(f"\nFinal milestone {MILESTONE_INDEX} status: {status} "
          f"({STATUS_NAMES.get(status, 'UNKNOWN')})")
    print("Expected: 4 (RELEASED)")
    print("\nCross-check freelancer's USDC balance with check_freelancer_balance.py")


if __name__ == "__main__":
    main()