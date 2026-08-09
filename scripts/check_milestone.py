"""Check the current on-chain status of milestone 0."""
import os
import boa
from eth_account import Account
from dotenv import load_dotenv

load_dotenv()

boa.set_network_env(os.getenv("BASE_SEPOLIA_RPC_URL"))
account = Account.from_key(os.getenv("DEPLOYER_PRIVATE_KEY"))
boa.env.add_account(account)

deployer = boa.load_partial("contracts/EscrowJob.vy")
escrow = deployer.at(os.getenv("DEPLOYED_ESCROW_ADDRESS"))

milestone = escrow.milestones(0)
status_names = {0: "PENDING", 1: "FUNDED", 2: "SUBMITTED", 3: "DISPUTED", 4: "RELEASED", 5: "REFUNDED", 6: "CANCELLED"}
print(f"Status: {milestone[1]} ({status_names.get(milestone[1], 'UNKNOWN')})")
print(f"Ruling winner: {milestone[5]}")
print(f"Ruling confidence: {milestone[6]}")
print(f"Appealed: {milestone[10]}")
print(f"Needs secondary review: {milestone[11]}")