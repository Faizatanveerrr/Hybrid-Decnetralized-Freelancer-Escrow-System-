"""Check freelancer's USDC balance after the fast-test finalize."""
import os
import boa
from eth_account import Account
from dotenv import load_dotenv

load_dotenv()

boa.set_network_env(os.getenv("BASE_SEPOLIA_RPC_URL"))
account = Account.from_key(os.getenv("DEPLOYER_PRIVATE_KEY"))
boa.env.add_account(account)

usdc_abi = """[
  {"name":"balanceOf","type":"function","stateMutability":"view",
   "inputs":[{"name":"account","type":"address"}],
   "outputs":[{"type":"uint256"}]}
]"""

usdc = boa.loads_abi(usdc_abi, name="IERC20").at("0x036CbD53842c5426634e7929541eC2318f3dCF7e")
balance = usdc.balanceOf("0x198702b4fBCc6f0eF9838Be156696C1BfE012a8F")
print(f"Freelancer USDC balance: {balance / 10**6}")