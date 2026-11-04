"""Compile the Vyper contracts to shared/artifacts.json (ABI + bytecode).

Run with:  npm run build:contracts   (needs `pip install -r requirements.txt`)
The generated file is committed, so you only need to re-run this after
editing a .vy file.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACTS = ["EscrowX", "MockINR"]


def compile_one(name: str) -> dict:
    src = ROOT / "contracts" / f"{name}.vy"
    out = subprocess.run(
        [sys.executable, "-m", "vyper", "-f", "abi,bytecode", str(src)],
        capture_output=True, text=True, check=True,
    ).stdout.strip().splitlines()
    return {"abi": json.loads(out[0]), "bytecode": out[1].strip()}


if __name__ == "__main__":
    artifacts = {name: compile_one(name) for name in CONTRACTS}
    target = ROOT / "shared" / "artifacts.json"
    target.write_text(json.dumps(artifacts))
    print(f"Wrote {target} ({', '.join(CONTRACTS)})")
