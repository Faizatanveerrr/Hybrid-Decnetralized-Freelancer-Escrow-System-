"""Deploy the throwaway EscrowJobFastTest.vy (60-second appeal period) to Base Sepolia."""
import os
import boa
from eth_account import Account
from dotenv import load_dotenv

load_dotenv()

USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
REVIEW_PERIOD_SECONDS = 7 * 24 * 60 * 60
MILESTONE_AMOUNTS = [1 * 10**6]  # just 1 USDC, this is throwaway test money

FREELANCER = "0x198702b4fBCc6f0eF9838Be156696C1BfE012a8F"
ARBITRATOR = "0x0BBDa4361Eb1DA3156cB7f580Bffbe3A52458E81"

rpc_url = os.getenv("BASE_SEPOLIA_RPC_URL")
private_key = os.getenv("DEPLOYER_PRIVATE_KEY")

print("Connecting to Base Sepolia...")
boa.set_network_env(rpc_url)
account = Account.from_key(private_key)
boa.env.add_account(account)
print(f"Deployer: {account.address}")

print("Deploying EscrowJobFastTest.vy...")
contract = boa.load(
    "contracts/EscrowJobFastTest.vy",
    FREELANCER,
    USDC_BASE_SEPOLIA,
    ARBITRATOR,
    REVIEW_PERIOD_SECONDS,
    MILESTONE_AMOUNTS,
)

print(f"Deployed at: {contract.address}")
print(f"View: https://sepolia.basescan.org/address/{contract.address}")
print()
print("Add this to your .env file:")
print(f"DEPLOYED_FASTTEST_ADDRESS={contract.address}")