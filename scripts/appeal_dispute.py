"""Appeal the current ruling on milestone 0, as the freelancer (who lost the primary ruling)."""
import os
import boa
from eth_account import Account
from dotenv import load_dotenv

load_dotenv()

boa.set_network_env(os.getenv("BASE_SEPOLIA_RPC_URL"))
account = Account.from_key(os.getenv("FREELANCER_PRIVATE_KEY"))
boa.env.add_account(account)

deployer = boa.load_partial("contracts/EscrowJob.vy")
escrow = deployer.at(os.getenv("DEPLOYED_ESCROW_ADDRESS"))

print(f"Appealing as freelancer: {account.address}")
with boa.env.prank(account.address):
    escrow.appeal_ruling(0)
print("Appeal transaction sent.")