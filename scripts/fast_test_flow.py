"""
Full flow on the throwaway FastTest contract (60-second appeal window):
fund -> submit -> dispute -> high-confidence ruling -> wait 65s -> finalize.

Every call (read or write) is wrapped in retry logic, because this RPC
sometimes hasn't indexed the latest block yet immediately after a
transaction, causing a transient error on the very next call.
"""
import os
import sys
import time
import boa
from eth_account import Account
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
from ipfs_client import upload_json

load_dotenv()

ERC20_ABI = """[
  {"name":"approve","type":"function","stateMutability":"nonpayable",
   "inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],
   "outputs":[{"type":"bool"}]},
  {"name":"balanceOf","type":"function","stateMutability":"view",
   "inputs":[{"name":"account","type":"address"}],
   "outputs":[{"type":"uint256"}]}
]"""

STATUS_NAMES = {0: "PENDING", 1: "FUNDED", 2: "SUBMITTED", 3: "DISPUTED", 4: "RELEASED", 5: "REFUNDED", 6: "CANCELLED"}


def with_retry(fn, description, retries=6, delay=5):
    """Run fn(), retrying on the known transient post-transaction sync error."""
    for attempt in range(1, retries + 1):
        try:
            result = fn()
            if attempt > 1:
                print(f"  -> succeeded on retry {attempt}.")
            return result
        except TypeError as e:
            if "NoneType" in str(e) and "subscriptable" in str(e):
                print(f"  -> {description}: transient RPC sync issue (attempt {attempt}/{retries}), waiting {delay}s...")
                time.sleep(delay)
            else:
                raise
    raise RuntimeError(f"Gave up after {retries} retries: {description}")


def status_of(escrow, mid=0):
    return with_retry(lambda: escrow.milestones(mid)[1], "reading milestone status")


def main():
    rpc_url = os.getenv("BASE_SEPOLIA_RPC_URL")
    contract_address = os.getenv("DEPLOYED_FASTTEST_ADDRESS")

    boa.set_network_env(rpc_url)
    client = Account.from_key(os.getenv("DEPLOYER_PRIVATE_KEY"))
    freelancer = Account.from_key(os.getenv("FREELANCER_PRIVATE_KEY"))
    arbitrator = Account.from_key(os.getenv("ARBITRATOR_PRIVATE_KEY"))
    for acc in (client, freelancer, arbitrator):
        boa.env.add_account(acc)

    escrow_deployer = boa.load_partial("contracts/EscrowJobFastTest.vy")
    escrow = escrow_deployer.at(contract_address)

    usdc = boa.loads_abi(ERC20_ABI, name="IERC20").at(escrow.token())
    amount = with_retry(lambda: escrow.milestones(0)[0], "reading amount")

    status = status_of(escrow)
    print(f"Starting status: {status} ({STATUS_NAMES[status]})")

    if status == 0:
        print("Approving USDC...")
        def do_approve():
            with boa.env.prank(client.address):
                usdc.approve(contract_address, amount)
        with_retry(do_approve, "approving USDC")
        print("Approved.")

        print("Funding milestone...")
        def do_fund():
            with boa.env.prank(client.address):
                escrow.fund_milestone(0)
        with_retry(do_fund, "funding milestone")
        print("Funded.")

    status = status_of(escrow)
    if status == 1:
        cid = upload_json({"note": "fast-test submission"}, name="fasttest-proof")
        print("Submitting milestone...")
        def do_submit():
            with boa.env.prank(freelancer.address):
                escrow.submit_milestone(0, f"ipfs://{cid}")
        with_retry(do_submit, "submitting milestone")
        print("Submitted.")

    status = status_of(escrow)
    if status == 2:
        print("Raising dispute...")
        def do_dispute():
            with boa.env.prank(client.address):
                escrow.raise_dispute(0)
        with_retry(do_dispute, "raising dispute")
        print("Disputed.")

    status = status_of(escrow)
    ruling_submitted_at = with_retry(lambda: escrow.milestones(0)[8], "reading ruling status")
    if status == 3 and ruling_submitted_at == 0:
        cid = upload_json({"reasoning": "fast-test: freelancer wins"}, name="fasttest-ruling")
        print("Submitting high-confidence ruling...")
        def do_ruling():
            with boa.env.prank(arbitrator.address):
                escrow.submit_ruling(0, freelancer.address, 85, f"ipfs://{cid}")
        with_retry(do_ruling, "submitting ruling")
        print("Ruling submitted. Appeal window: 60 seconds.")

    print("Waiting 65 seconds for the appeal window to close...")
    time.sleep(65)

    print("Calling finalize_ruling()...")
    def do_finalize():
        escrow.finalize_ruling(0)
    with_retry(do_finalize, "finalizing ruling")
    print("Finalized.")

    final_status = status_of(escrow)
    print()
    print("=" * 60)
    print(f"FINAL STATUS: {final_status} ({STATUS_NAMES.get(final_status, 'UNKNOWN')})")
    print("Expected: 4 (RELEASED) - freelancer should have been paid")
    print("=" * 60)


if __name__ == "__main__":
    main()