"""
IPFS upload helper using Pinata.

Usage as a library:
    from ipfs_client import upload_file, upload_json, get_gateway_url

    cid = upload_file("proof.png")
    print(get_gateway_url(cid))

Usage from command line (for a quick manual test):
    python scripts/ipfs_client.py path/to/some/file.png
"""
import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv()

PINATA_JWT = os.getenv("PINATA_JWT")
PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"
PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS"
GATEWAY_URL = "https://gateway.pinata.cloud/ipfs"


def _check_jwt():
    if not PINATA_JWT:
        raise RuntimeError(
            "PINATA_JWT not found. Make sure you have a .env file in the "
            "project root with a line like: PINATA_JWT=your_actual_jwt"
        )


def upload_file(filepath: str) -> str:
    """Upload a local file to IPFS via Pinata. Returns the CID (content hash)."""
    _check_jwt()

    if not os.path.isfile(filepath):
        raise FileNotFoundError(f"No such file: {filepath}")

    headers = {"Authorization": f"Bearer {PINATA_JWT}"}

    with open(filepath, "rb") as f:
        files = {"file": (os.path.basename(filepath), f)}
        response = requests.post(PIN_FILE_URL, headers=headers, files=files)

    if response.status_code != 200:
        raise RuntimeError(f"Pinata upload failed ({response.status_code}): {response.text}")

    cid = response.json()["IpfsHash"]
    return cid


def upload_json(data: dict, name: str = "data") -> str:
    """Upload a Python dict as a JSON file to IPFS via Pinata. Returns the CID."""
    _check_jwt()

    headers = {
        "Authorization": f"Bearer {PINATA_JWT}",
        "Content-Type": "application/json",
    }
    payload = {
        "pinataContent": data,
        "pinataMetadata": {"name": name},
    }

    response = requests.post(PIN_JSON_URL, headers=headers, json=payload)

    if response.status_code != 200:
        raise RuntimeError(f"Pinata upload failed ({response.status_code}): {response.text}")

    cid = response.json()["IpfsHash"]
    return cid


def get_gateway_url(cid: str) -> str:
    """Build a viewable URL for a given CID."""
    return f"{GATEWAY_URL}/{cid}"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/ipfs_client.py <path-to-file>")
        sys.exit(1)

    path = sys.argv[1]
    print(f"Uploading {path} to IPFS via Pinata...")
    cid = upload_file(path)
    print(f"Success!")
    print(f"CID: {cid}")
    print(f"View at: {get_gateway_url(cid)}")