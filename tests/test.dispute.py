"""
Tests for the dispute resolution / AI arbitration flow:
raise_dispute -> submit_ruling -> (appeal_ruling | finalize_ruling) -> submit_secondary_ruling
"""
import boa
import pytest

MILESTONE_AMOUNTS = [1000 * 10**6]
REVIEW_PERIOD = 7 * 24 * 60 * 60       # 7 days
APPEAL_PERIOD = 3 * 24 * 60 * 60       # 3 days, must match contract constant
HIGH_CONFIDENCE = 90
LOW_CONFIDENCE = 50   # below the 70 threshold


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
def token():
    return boa.load("contracts/MockUSDC.vy")


@pytest.fixture
def escrow(client, freelancer, arbitrator, token):
    with boa.env.prank(client):
        contract = boa.load(
            "contracts/EscrowJob.vy",
            freelancer,
            token.address,
            arbitrator,
            REVIEW_PERIOD,
            MILESTONE_AMOUNTS,
        )
    return contract


@pytest.fixture
def disputed_milestone(client, freelancer, token, escrow):
    """Fund, submit, and raise a dispute on milestone 0. Returns nothing;
    just leaves the escrow in DISPUTED state for the test to act on."""
    token.mint(client, MILESTONE_AMOUNTS[0])
    with boa.env.prank(client):
        token.approve(escrow.address, MILESTONE_AMOUNTS[0])
        escrow.fund_milestone(0)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof")
    with boa.env.prank(client):
        escrow.raise_dispute(0)
    return escrow


# ---------------------------------------------------------------------------
# Raising a dispute
# ---------------------------------------------------------------------------

def test_client_can_raise_dispute(client, freelancer, token, escrow):
    token.mint(client, MILESTONE_AMOUNTS[0])
    with boa.env.prank(client):
        token.approve(escrow.address, MILESTONE_AMOUNTS[0])
        escrow.fund_milestone(0)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof")
    with boa.env.prank(client):
        escrow.raise_dispute(0)

    m0 = escrow.milestones(0)
    assert m0[1] == 3  # DISPUTED
    assert m0[4] == client  # disputed_by


def test_freelancer_can_raise_dispute(client, freelancer, token, escrow):
    token.mint(client, MILESTONE_AMOUNTS[0])
    with boa.env.prank(client):
        token.approve(escrow.address, MILESTONE_AMOUNTS[0])
        escrow.fund_milestone(0)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof")
        escrow.raise_dispute(0)

    m0 = escrow.milestones(0)
    assert m0[1] == 3  # DISPUTED
    assert m0[4] == freelancer


def test_outsider_cannot_raise_dispute(client, freelancer, token, escrow):
    token.mint(client, MILESTONE_AMOUNTS[0])
    with boa.env.prank(client):
        token.approve(escrow.address, MILESTONE_AMOUNTS[0])
        escrow.fund_milestone(0)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof")

    outsider = boa.env.generate_address()
    with boa.env.prank(outsider):
        with pytest.raises(Exception):
            escrow.raise_dispute(0)


def test_cannot_dispute_before_submission(client, escrow):
    with boa.env.prank(client):
        with pytest.raises(Exception):
            escrow.raise_dispute(0)


def test_disputed_milestone_blocks_approval_and_timeout_claim(client, freelancer, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(client):
        with pytest.raises(Exception):
            escrow.approve_milestone(0)

    boa.env.time_travel(seconds=REVIEW_PERIOD + 1)
    with pytest.raises(Exception):
        escrow.claim_after_timeout(0)


# ---------------------------------------------------------------------------
# Primary ruling + high-confidence path (appeal window -> finalize)
# ---------------------------------------------------------------------------

def test_only_arbitrator_can_submit_ruling(client, freelancer, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(client):
        with pytest.raises(Exception):
            escrow.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://ruling")


def test_high_confidence_ruling_opens_appeal_window(freelancer, arbitrator, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://ruling-reasoning")

    m0 = escrow.milestones(0)
    assert m0[1] == 3  # still DISPUTED, not yet finalized
    assert m0[5] == freelancer  # ruling_winner
    assert m0[6] == HIGH_CONFIDENCE  # ruling_confidence
    assert m0[11] == False  # needs_secondary_review


def test_finalize_reverts_before_appeal_window_closes(arbitrator, freelancer, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://ruling")

    with pytest.raises(Exception):
        escrow.finalize_ruling(0)


def test_finalize_pays_out_winner_after_appeal_window(arbitrator, freelancer, token, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://ruling")

    boa.env.time_travel(seconds=APPEAL_PERIOD + 1)
    escrow.finalize_ruling(0)  # anyone can call

    assert token.balanceOf(freelancer) == MILESTONE_AMOUNTS[0]
    m0 = escrow.milestones(0)
    assert m0[1] == 4  # RELEASED


def test_finalize_refunds_client_if_client_won(arbitrator, client, token, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, client, HIGH_CONFIDENCE, "ipfs://ruling")

    boa.env.time_travel(seconds=APPEAL_PERIOD + 1)
    escrow.finalize_ruling(0)

    assert token.balanceOf(client) == MILESTONE_AMOUNTS[0]
    m0 = escrow.milestones(0)
    assert m0[1] == 5  # REFUNDED


# ---------------------------------------------------------------------------
# Low-confidence path (forced straight to secondary review)
# ---------------------------------------------------------------------------

def test_low_confidence_ruling_forces_secondary_review(arbitrator, freelancer, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, LOW_CONFIDENCE, "ipfs://uncertain-ruling")

    m0 = escrow.milestones(0)
    assert m0[11] == True  # needs_secondary_review
    assert m0[10] == 0     # appeal_deadline never set


def test_finalize_reverts_when_needs_secondary_review(arbitrator, freelancer, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, LOW_CONFIDENCE, "ipfs://uncertain-ruling")

    boa.env.time_travel(seconds=APPEAL_PERIOD + 1)
    with pytest.raises(Exception):
        escrow.finalize_ruling(0)  # even after "appeal window" time, still blocked


def test_secondary_ruling_pays_out_immediately(arbitrator, freelancer, token, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, LOW_CONFIDENCE, "ipfs://uncertain-ruling")
        escrow.submit_secondary_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://final-ruling")

    assert token.balanceOf(freelancer) == MILESTONE_AMOUNTS[0]
    m0 = escrow.milestones(0)
    assert m0[1] == 4  # RELEASED


# ---------------------------------------------------------------------------
# Appeal path (high-confidence ruling gets appealed -> forced to secondary review)
# ---------------------------------------------------------------------------

def test_client_can_appeal_high_confidence_ruling(client, arbitrator, freelancer, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://ruling")

    with boa.env.prank(client):
        escrow.appeal_ruling(0)

    m0 = escrow.milestones(0)
    assert m0[10] == True  # appealed


def test_cannot_finalize_after_appeal(client, arbitrator, freelancer, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://ruling")
    with boa.env.prank(client):
        escrow.appeal_ruling(0)

    boa.env.time_travel(seconds=APPEAL_PERIOD + 1)
    with pytest.raises(Exception):
        escrow.finalize_ruling(0)


def test_secondary_ruling_resolves_appealed_dispute(client, arbitrator, freelancer, token, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://ruling")
    with boa.env.prank(client):
        escrow.appeal_ruling(0)

    # secondary review overturns the primary ruling in favor of the client
    with boa.env.prank(arbitrator):
        escrow.submit_secondary_ruling(0, client, HIGH_CONFIDENCE, "ipfs://final-ruling")

    assert token.balanceOf(client) == MILESTONE_AMOUNTS[0]
    m0 = escrow.milestones(0)
    assert m0[1] == 5  # REFUNDED


def test_cannot_appeal_twice(client, freelancer, arbitrator, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://ruling")
    with boa.env.prank(client):
        escrow.appeal_ruling(0)
        with pytest.raises(Exception):
            escrow.appeal_ruling(0)


def test_cannot_appeal_after_window_closes(client, freelancer, arbitrator, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://ruling")

    boa.env.time_travel(seconds=APPEAL_PERIOD + 1)
    with boa.env.prank(client):
        with pytest.raises(Exception):
            escrow.appeal_ruling(0)


def test_outsider_cannot_appeal(arbitrator, freelancer, disputed_milestone):
    escrow = disputed_milestone
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://ruling")

    outsider = boa.env.generate_address()
    with boa.env.prank(outsider):
        with pytest.raises(Exception):
            escrow.appeal_ruling(0)