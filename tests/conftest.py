"""Shared fixtures for the EscrowX contract tests."""
import boa
import pytest

MILESTONE_AMOUNTS = [1000 * 10**6, 2000 * 10**6]
REVIEW_PERIOD = 7 * 24 * 60 * 60
APPEAL_WINDOW = 3 * 24 * 60 * 60
SPEC_URI = "ipfs://job-spec"

# Milestone status codes (must match contracts/EscrowX.vy)
PENDING, FUNDED, SUBMITTED, DISPUTED, RELEASED, REFUNDED, CANCELLED = range(7)

HIGH_CONFIDENCE = 90
LOW_CONFIDENCE = 50  # below the contract's 70 threshold


@pytest.fixture
def client():
    return boa.env.generate_address()


@pytest.fixture
def freelancer():
    return boa.env.generate_address()


@pytest.fixture
def arbitrator():
    return boa.env.generate_address()


@pytest.fixture
def outsider():
    return boa.env.generate_address()


@pytest.fixture
def token():
    return boa.load("contracts/MockUSDC.vy")


@pytest.fixture
def escrow(client, freelancer, arbitrator, token):
    with boa.env.prank(client):
        return boa.load(
            "contracts/EscrowX.vy",
            client,
            freelancer,
            arbitrator,
            token.address,
            REVIEW_PERIOD,
            APPEAL_WINDOW,
            SPEC_URI,
            MILESTONE_AMOUNTS,
            [0, 0],
        )


@pytest.fixture
def funded_client(client, token, escrow):
    """Mint USDC to the client and approve the escrow for all milestones."""
    total = sum(MILESTONE_AMOUNTS)
    token.mint(client, total)
    with boa.env.prank(client):
        token.approve(escrow.address, total)
    return client


@pytest.fixture
def submitted(client, freelancer, escrow, funded_client):
    """Milestone 0 funded and submitted (review period running)."""
    with boa.env.prank(client):
        escrow.fund_milestone(0)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof-0")
    return escrow


@pytest.fixture
def disputed(client, submitted):
    """Milestone 0 in DISPUTED state, no ruling yet."""
    with boa.env.prank(client):
        submitted.raise_dispute(0, "ipfs://evidence")
    return submitted
