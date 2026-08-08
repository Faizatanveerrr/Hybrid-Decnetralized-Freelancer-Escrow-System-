"""
Deploy EscrowJob.vy to Base Sepolia testnet.

Usage:
    python scripts/deploy_testnet.py <freelancer_address> <arbitrator_address>

Example:
    python scripts/deploy_testnet.py 0xFreelancerAddr... 0xArbitratorAddr...
"""
import os
import sys
import boa
from eth_account import Account
from dotenv import load_dotenv

load_dotenv()

# Circle's official USDC contract on Base Sepolia testnet
USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

REVIEW_PERIOD_SECONDS = 7 * 24 * 60 * 60  # 7 days
MILESTONE_AMOUNTS = [10 * 10**6, 20 * 10**6]  # 10 and 20 USDC (6 decimals) - small test amounts


def main():
    if len(sys.argv) != 3:
        print("Usage: python scripts/deploy_testnet.py <freelancer_address> <arbitrator_address>")
        sys.exit(1)

    freelancer_address = sys.argv[1]
    arbitrator_address = sys.argv[2]

    rpc_url = os.getenv("BASE_SEPOLIA_RPC_URL")
    private_key = os.getenv("DEPLOYER_PRIVATE_KEY")

    if not rpc_url:
        raise RuntimeError("BASE_SEPOLIA_RPC_URL not found in .env")
    if not private_key:
        raise RuntimeError("DEPLOYER_PRIVATE_KEY not found in .env")

    print("Connecting to Base Sepolia...")
    boa.set_network_env(rpc_url)

    account = Account.from_key(private_key)
    boa.env.add_account(account)
    print(f"Deployer address: {account.address}")

    print(f"Freelancer address: {freelancer_address}")
    print(f"Arbitrator address: {arbitrator_address}")
    print(f"USDC token (Base Sepolia): {USDC_BASE_SEPOLIA}")
    print(f"Milestone amounts: {MILESTONE_AMOUNTS}")
    print()
    print("Deploying EscrowJob.vy... (this sends a real transaction, please wait)")

    contract = boa.load(
        "contracts/EscrowJob.vy",
        freelancer_address,
        USDC_BASE_SEPOLIA,
        arbitrator_address,
        REVIEW_PERIOD_SECONDS,
        MILESTONE_AMOUNTS,
    )

    print()
    print("=" * 60)
    print("DEPLOYED SUCCESSFULLY")
    print(f"Contract address: {contract.address}")
    print(f"View on BaseScan: https://sepolia.basescan.org/address/{contract.address}")
    print("=" * 60)


if __name__ == "__main__":
    main()