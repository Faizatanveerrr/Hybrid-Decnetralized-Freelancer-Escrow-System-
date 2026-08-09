"""
End-to-end testnet flow: fund a milestone, submit proof, and raise a dispute
on the live deployed EscrowJob contract. This creates a real disputed
milestone that scripts/ai_arbitrate.py can then rule on.

Usage:
    python scripts/testnet_flow.py

Requires in .env:
    DEPLOYED_ESCROW_ADDRESS
    BASE_SEPOLIA_RPC_URL
    DEPLOYER_PRIVATE_KEY       (acts as the client)
    FREELANCER_PRIVATE_KEY     (acts as the freelancer)
    PINATA_JWT                 (for uploading proof to IPFS)
"""
import os
import sys
import boa
from eth_account import Account
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
from ipfs_client import upload_json

load_dotenv()

# Minimal ERC20 ABI - just what we need (approve + balanceOf)
ERC20_ABI = """[
  {"name":"approve","type":"function","stateMutability":"nonpayable",
   "inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],
   "outputs":[{"type":"bool"}]},
  {"name":"balanceOf","type":"function","stateMutability":"view",
   "inputs":[{"name":"account","type":"address"}],
   "outputs":[{"type":"uint256"}]}
]"""

MILESTONE_ID = 0  # the first milestone from deployment (10 USDC)


def main():
    rpc_url = os.getenv("BASE_SEPOLIA_RPC_URL")
    contract_address = os.getenv("DEPLOYED_ESCROW_ADDRESS")
    client_key = os.getenv("DEPLOYER_PRIVATE_KEY")
    freelancer_key = os.getenv("FREELANCER_PRIVATE_KEY")

    if not all([rpc_url, contract_address, client_key, freelancer_key]):
        raise RuntimeError("Missing one of: BASE_SEPOLIA_RPC_URL, DEPLOYED_ESCROW_ADDRESS, "
                            "DEPLOYER_PRIVATE_KEY, FREELANCER_PRIVATE_KEY in .env")

    print("Connecting to Base Sepolia...")
    boa.set_network_env(rpc_url)

    client_account = Account.from_key(client_key)
    freelancer_account = Account.from_key(freelancer_key)
    boa.env.add_account(client_account)
    boa.env.add_account(freelancer_account)

    print(f"Client address:     {client_account.address}")
    print(f"Freelancer address: {freelancer_account.address}")

    escrow_deployer = boa.load_partial("contracts/EscrowJob.vy")
    escrow = escrow_deployer.at(contract_address)

    token_address = escrow.token()
    usdc_factory = boa.loads_abi(ERC20_ABI, name="IERC20")
    usdc = usdc_factory.at(token_address)

    milestone = escrow.milestones(MILESTONE_ID)
    amount = milestone[0]
    status = milestone[1]
    print(f"Milestone {MILESTONE_ID}: amount={amount / 10**6} USDC, status={status}")

    # --- Step 1: Fund the milestone (as client) ---
    if status == 0:  # PENDING
        client_balance = usdc.balanceOf(client_account.address)
        print(f"Client USDC balance: {client_balance / 10**6}")
        if client_balance < amount:
            raise RuntimeError(
                f"Client doesn't have enough testnet USDC. Get some from "
                f"https://faucet.circle.com/ for address {client_account.address}"
            )

        print("Approving escrow contract to spend USDC...")
        with boa.env.prank(client_account.address):
            usdc.approve(contract_address, amount)

        print(f"Funding milestone {MILESTONE_ID}...")
        with boa.env.prank(client_account.address):
            escrow.fund_milestone(MILESTONE_ID)
        print("Funded.")
    else:
        print(f"Milestone already funded or further along (status={status}), skipping fund step.")

    # --- Step 2: Freelancer submits proof ---
    milestone = escrow.milestones(MILESTONE_ID)
    status = milestone[1]

    if status == 1:  # FUNDED
        print("Uploading sample proof of work to IPFS...")
        proof_cid = upload_json(
            {
                "description": "Completed the landing page as requested. "
                                "Includes responsive layout, contact form, and hero section.",
                "deliverable_note": "This is a test submission for arbitration testing. "
                                     "Intentionally incomplete to trigger a dispute scenario.",
            },
            name=f"milestone-{MILESTONE_ID}-proof",
        )
        proof_uri = f"ipfs://{proof_cid}"
        print(f"Proof uploaded: {proof_uri}")

        print("Submitting milestone (as freelancer)...")
        with boa.env.prank(freelancer_account.address):
            escrow.submit_milestone(MILESTONE_ID, proof_uri)
        print("Submitted.")
    else:
        print(f"Milestone not in FUNDED state (status={status}), skipping submit step.")

    # --- Step 3: Raise a dispute (as client, simulating client unhappy with the work) ---
    milestone = escrow.milestones(MILESTONE_ID)
    status = milestone[1]

    if status == 2:  # SUBMITTED
        print("Raising dispute (as client)...")
        with boa.env.prank(client_account.address):
            escrow.raise_dispute(MILESTONE_ID)
        print("Dispute raised.")
    else:
        print(f"Milestone not in SUBMITTED state (status={status}), skipping dispute step.")

    milestone = escrow.milestones(MILESTONE_ID)
    print()
    print("=" * 60)
    print(f"Milestone {MILESTONE_ID} final status: {milestone[1]} (3 = DISPUTED)")
    print(f"View contract: https://sepolia.basescan.org/address/{contract_address}")
    print("=" * 60)
    if milestone[1] == 3:
        print("\nReady for AI arbitration. Run:")
        print(f'  python scripts/ai_arbitrate.py {MILESTONE_ID} "Landing page must include a working contact form and be fully responsive"')


if __name__ == "__main__":
    main()