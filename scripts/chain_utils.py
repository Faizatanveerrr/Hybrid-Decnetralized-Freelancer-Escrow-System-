"""
chain_utils.py

Shared helpers for interacting with contracts on this project's Base
Sepolia / Alchemy / Titanoboa setup, centered on one recurring, known
issue:

    Every real transaction on this RPC setup throws
    `TypeError: 'NoneType' object is not subscriptable` immediately
    AFTER it has already succeeded and been mined. Titanoboa tries to
    re-sync its internal fork state right after broadcasting, and the
    RPC (Alchemy free tier) hasn't indexed the very latest block yet.
    This is a timing/race condition, not a real failure — confirmed
    repeatedly via BaseScan.

The three helpers below handle this correctly for the three different
situations it shows up in. They deliberately do NOT share one generic
"retry on TypeError" wrapper, because the safe response is different
in each case:

  - run_tx()      : a STATE-CHANGING call already broadcast. Retrying by
                     calling the function again would resend a duplicate
                     transaction. Catch once, log, move on.
  - read_view()    : a READ-ONLY call, nothing was broadcast. Safe (and
                     necessary) to actually retry with backoff.
  - deploy_with_recovery() : a deploy call that crashed post-broadcast.
                     We've lost the return value (the contract object),
                     so recover the deployed address from the transaction
                     receipt via a direct RPC call instead of guessing.
"""

import re
import sys
import io
import time
import contextlib
import requests
import boa


def run_tx(fn, *args, **kwargs):
    """
    Sends a state-changing transaction. If the known harmless post-tx
    TypeError fires, the transaction has already broadcast and almost
    certainly mined — log it and return None WITHOUT resending.

    Use for: fund_milestone, submit_milestone, approve_milestone,
    claim_after_timeout, raise_dispute, approve (ERC20), etc.
    """
    try:
        return fn(*args, **kwargs)
    except TypeError as e:
        if "NoneType" not in str(e) and "subscriptable" not in str(e):
            raise  # a different TypeError — don't swallow real bugs
        print("  [info] harmless post-tx sync error (RPC hasn't indexed "
              "latest block yet) — transaction was already broadcast and "
              "very likely mined. Not resending.")
        return None


def read_view(fn, *args, retries=5, delay=4, **kwargs):
    """
    Calls a read-only view function. No transaction is broadcast, so
    retrying is safe here (unlike run_tx). Backs off and retries if the
    RPC hasn't caught up yet.

    Use for: escrow.milestones(index), balance checks, any view/pure call.
    """
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            return fn(*args, **kwargs)
        except TypeError as e:
            if "NoneType" not in str(e) and "subscriptable" not in str(e):
                raise
            last_err = e
            if attempt < retries:
                print(f"  [info] RPC not caught up yet, retrying read "
                      f"({attempt}/{retries}) in {delay}s...")
                time.sleep(delay)
    print("  [warning] read still failing after retries — RPC may be lagging "
          "longer than usual. Try again in a minute with a standalone check "
          "script (e.g. check_milestone.py).")
    raise last_err


class _Tee(io.StringIO):
    """Captures printed output while still passing it through to real stdout."""
    def __init__(self, real_stdout):
        super().__init__()
        self._real = real_stdout

    def write(self, s):
        self._real.write(s)
        return super().write(s)


def deploy_with_recovery(rpc_url, filename, *args):
    """
    Deploys a contract. If the known harmless post-tx TypeError fires,
    the deployment has almost certainly already succeeded but we've lost
    the return value — recover the deployed address from the transaction
    receipt via a direct RPC call, then rebind a contract object to it.
    """
    tee = _Tee(sys.stdout)
    try:
        with contextlib.redirect_stdout(tee):
            return boa.load(filename, *args)
    except TypeError as e:
        if "NoneType" not in str(e) and "subscriptable" not in str(e):
            raise

        captured = tee.getvalue()
        match = re.search(r"tx broadcasted:\s*(0x[0-9a-fA-F]+)", captured)
        if not match:
            print("  [error] deployment tx hash could not be recovered from output.")
            raise
        tx_hash = match.group(1)
        print(f"  [info] harmless post-tx sync error — recovering deployed "
              f"address from tx {tx_hash} via direct RPC call...")

        receipt = None
        for attempt in range(1, 6):
            resp = requests.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "eth_getTransactionReceipt",
                    "params": [tx_hash],
                },
                timeout=30,
            )
            receipt = resp.json().get("result")
            if receipt and receipt.get("contractAddress"):
                break
            print(f"  [info] receipt not ready yet, retrying ({attempt}/5)...")
            time.sleep(4)

        if not receipt or not receipt.get("contractAddress"):
            print("  [error] could not fetch contract address from receipt. "
                  "Check BaseScan manually for tx:", tx_hash)
            raise RuntimeError(f"deployment receipt unavailable for {tx_hash}")

        deployed_address = receipt["contractAddress"]
        print(f"  [info] recovered deployed address: {deployed_address}")
        return boa.load_partial(filename).at(deployed_address)