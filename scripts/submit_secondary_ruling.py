"""Submit a secondary (final, binding) ruling on the appealed milestone 0."""
import os
import sys
import boa
from eth_account import Account
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
from ipfs_client import upload_json

load_dotenv()

boa.set_network_env(os.getenv("BASE_SEPOLIA_RPC_URL"))
account = Account.from_key(os.getenv("ARBITRATOR_PRIVATE_KEY"))
boa.env.add_account(account)

deployer = boa.load_partial("contracts/EscrowJob.vy")
escrow = deployer.at(os.getenv("DEPLOYED_ESCROW_ADDRESS"))

# Secondary review upholds the original ruling: client wins (work was incomplete)
winner_address = escrow.client()
confidence = 92

print("Uploading secondary review reasoning to IPFS...")
reasoning_cid = upload_json(
    {
        "milestone_id": 0,
        "review_type": "secondary",
        "reasoning": "Secondary review upholds the primary ruling. The submitted "
                     "evidence explicitly states the work was intentionally "
                     "incomplete, which does not satisfy the acceptance criteria "
                     "requiring a fully responsive page with a working contact form.",
        "winner": "client",
        "confidence": confidence,
    },
    name="milestone-0-secondary-ruling",
)
reasoning_uri = f"ipfs://{reasoning_cid}"
print(f"Reasoning stored at: {reasoning_uri}")

print(f"Submitting secondary ruling (winner={winner_address})...")
with boa.env.prank(account.address):
    escrow.submit_secondary_ruling(0, winner_address, confidence, reasoning_uri)

print("Secondary ruling submitted. This is final and should trigger immediate payout.")