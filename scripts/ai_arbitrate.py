
import os
import sys
import json
import boto3
import boa
import requests
from eth_account import Account
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
from ipfs_client import upload_json, get_gateway_url

load_dotenv()

NOVA_MODEL_ID = os.getenv("NOVA_MODEL_ID", "us.amazon.nova-lite-v1:0")
CONFIDENCE_DEFAULT_IF_UNPARSEABLE = 50  # safe fallback: forces secondary review


def fetch_ipfs_content(uri: str) -> str:
    """Fetch content from an ipfs:// URI via the Pinata gateway."""
    cid = uri.replace("ipfs://", "")
    url = get_gateway_url(cid)
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.text


def ask_nova_for_ruling(acceptance_criteria: str, evidence_text: str) -> dict:
    """Call Amazon Nova Lite to evaluate the dispute. Returns a dict with
    winner ('client' or 'freelancer'), confidence (0-100), and reasoning (str)."""

    client = boto3.client(
        "bedrock-runtime",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )

    system_prompt = (
        "You are an impartial arbitrator for a freelance escrow dispute. "
        "You will be given the milestone's acceptance criteria and the evidence "
        "the freelancer submitted. Decide whether the evidence satisfies the "
        "criteria. Respond ONLY with a JSON object, no other text, in exactly "
        "this format: "
        '{"winner": "freelancer" or "client", "confidence": <integer 0-100>, '
        '"reasoning": "<your explanation>"}. '
        "winner=\"freelancer\" means the evidence satisfies the criteria and the "
        "freelancer should be paid. winner=\"client\" means it does not, and the "
        "client should be refunded. confidence reflects how certain you are."
    )

    user_message = (
        f"ACCEPTANCE CRITERIA:\n{acceptance_criteria}\n\n"
        f"SUBMITTED EVIDENCE:\n{evidence_text}\n\n"
        "Provide your ruling as the specified JSON object."
    )

    response = client.converse(
        modelId=NOVA_MODEL_ID,
        system=[{"text": system_prompt}],
        messages=[{"role": "user", "content": [{"text": user_message}]}],
        inferenceConfig={"maxTokens": 500, "temperature": 0.2, "topP": 0.9},
    )

    raw_text = response["output"]["message"]["content"][0]["text"]

    try:
        cleaned = raw_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(cleaned)
        winner = parsed["winner"]
        confidence = int(parsed["confidence"])
        reasoning = parsed["reasoning"]
        assert winner in ("freelancer", "client")
        assert 0 <= confidence <= 100
        return {"winner": winner, "confidence": confidence, "reasoning": reasoning}
    except Exception as e:
        return {
            "winner": "client",
            "confidence": CONFIDENCE_DEFAULT_IF_UNPARSEABLE,
            "reasoning": f"AI response could not be parsed reliably. Raw response: {raw_text}. Parse error: {e}",
        }


def main():
    if len(sys.argv) != 3:
        print('Usage: python scripts/ai_arbitrate.py <milestone_id> "<acceptance_criteria>"')
        sys.exit(1)

    milestone_id = int(sys.argv[1])
    acceptance_criteria = sys.argv[2]

    contract_address = os.getenv("DEPLOYED_ESCROW_ADDRESS")
    rpc_url = os.getenv("BASE_SEPOLIA_RPC_URL")
    arbitrator_key = os.getenv("ARBITRATOR_PRIVATE_KEY")

    if not contract_address:
        raise RuntimeError("DEPLOYED_ESCROW_ADDRESS not found in .env")
    if not rpc_url:
        raise RuntimeError("BASE_SEPOLIA_RPC_URL not found in .env")
    if not arbitrator_key:
        raise RuntimeError("ARBITRATOR_PRIVATE_KEY not found in .env")

    print("Connecting to Base Sepolia...")
    boa.set_network_env(rpc_url)
    account = Account.from_key(arbitrator_key)
    boa.env.add_account(account)
    print(f"Arbitrator address: {account.address}")

    deployer = boa.load_partial("contracts/EscrowJob.vy")
    contract = deployer.at(contract_address)

    milestone = contract.milestones(milestone_id)
    status = milestone[1]
    proof_uri = milestone[2]

    if status != 3:  # DISPUTED
        raise RuntimeError(f"Milestone {milestone_id} is not in DISPUTED state (status={status})")

    print(f"Fetching evidence from: {proof_uri}")
    evidence_text = fetch_ipfs_content(proof_uri)
    print(f"Evidence retrieved ({len(evidence_text)} chars)")

    print("Asking Amazon Nova Lite to rule on the dispute...")
    ruling = ask_nova_for_ruling(acceptance_criteria, evidence_text)
    print(f"AI ruling: winner={ruling['winner']}, confidence={ruling['confidence']}")
    print(f"Reasoning: {ruling['reasoning']}")

    print("Uploading full reasoning to IPFS...")
    reasoning_cid = upload_json(
        {
            "milestone_id": milestone_id,
            "acceptance_criteria": acceptance_criteria,
            "evidence": evidence_text,
            "winner": ruling["winner"],
            "confidence": ruling["confidence"],
            "reasoning": ruling["reasoning"],
            "model": NOVA_MODEL_ID,
        },
        name=f"arbitration-ruling-milestone-{milestone_id}",
    )
    reasoning_uri = f"ipfs://{reasoning_cid}"
    print(f"Reasoning stored at: {reasoning_uri}")

    winner_address = contract.freelancer() if ruling["winner"] == "freelancer" else contract.client()

    print(f"Submitting ruling on-chain (winner={winner_address})...")
    contract.submit_ruling(milestone_id, winner_address, ruling["confidence"], reasoning_uri)

    print()
    print("=" * 60)
    print("RULING SUBMITTED SUCCESSFULLY")
    print(f"Winner: {ruling['winner']} ({winner_address})")
    print(f"Confidence: {ruling['confidence']}/100")
    if ruling["confidence"] >= 70:
        print("High confidence: 3-day appeal window now open.")
    else:
        print("Low confidence: secondary review is now required before payout.")
    print("=" * 60)


if __name__ == "__main__":
    main()