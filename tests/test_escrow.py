"""
Tests for the core EscrowJob contract: funding, submission, approval,
auto-release on timeout, cancellation/refunds, and access control.
"""
import boa
import pytest

MILESTONE_AMOUNTS = [1000 * 10**6, 2000 * 10**6]  # 1000 and 2000 "USDC" (6 decimals)
REVIEW_PERIOD = 7 * 24 * 60 * 60  # 7 days in seconds


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
def funded_client(client, token, escrow):
    """Mint USDC to the client and approve the escrow contract to pull it."""
    total = sum(MILESTONE_AMOUNTS)
    token.mint(client, total)
    with boa.env.prank(client):
        token.approve(escrow.address, total)
    return client


# ---------------------------------------------------------------------------
# Job creation
# ---------------------------------------------------------------------------

def test_job_created_with_correct_state(escrow, client, freelancer, token):
    assert escrow.client() == client
    assert escrow.freelancer() == freelancer
    assert escrow.token() == token.address
    assert escrow.milestone_count() == 2


def test_milestones_start_pending(escrow):
    m0 = escrow.milestones(0)
    m1 = escrow.milestones(1)
    assert m0[1] == 0  # status == PENDING
    assert m1[1] == 0
    assert m0[0] == MILESTONE_AMOUNTS[0]
    assert m1[0] == MILESTONE_AMOUNTS[1]


def test_cannot_create_job_with_self_as_freelancer(client, arbitrator, token):
    with boa.env.prank(client):
        with pytest.raises(Exception):
            boa.load("contracts/EscrowJob.vy", client, token.address, arbitrator, REVIEW_PERIOD, MILESTONE_AMOUNTS)


def test_cannot_create_job_with_no_milestones(client, freelancer, arbitrator, token):
    with boa.env.prank(client):
        with pytest.raises(Exception):
            boa.load("contracts/EscrowJob.vy", freelancer, token.address, arbitrator, REVIEW_PERIOD, [])


# ---------------------------------------------------------------------------
# Funding
# ---------------------------------------------------------------------------

def test_fund_milestone_transfers_usdc_into_escrow(escrow, funded_client, token):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)

    assert token.balanceOf(escrow.address) == MILESTONE_AMOUNTS[0]
    m0 = escrow.milestones(0)
    assert m0[1] == 1  # FUNDED


def test_only_client_can_fund(escrow, funded_client, freelancer):
    with boa.env.prank(freelancer):
        with pytest.raises(Exception):
            escrow.fund_milestone(0)


def test_cannot_fund_twice(escrow, funded_client):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)
        with pytest.raises(Exception):
            escrow.fund_milestone(0)


def test_fund_without_allowance_reverts(escrow, client, token):
    token.mint(client, MILESTONE_AMOUNTS[0])
    # no approve() call
    with boa.env.prank(client):
        with pytest.raises(Exception):
            escrow.fund_milestone(0)


# ---------------------------------------------------------------------------
# Submission
# ---------------------------------------------------------------------------

def test_freelancer_can_submit_after_funding(escrow, funded_client, freelancer):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)

    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof-hash-123")

    m0 = escrow.milestones(0)
    assert m0[1] == 2  # SUBMITTED
    assert m0[2] == "ipfs://proof-hash-123"


def test_only_freelancer_can_submit(escrow, funded_client):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)
        with pytest.raises(Exception):
            escrow.submit_milestone(0, "ipfs://fake")


def test_cannot_submit_unfunded_milestone(escrow, freelancer):
    with boa.env.prank(freelancer):
        with pytest.raises(Exception):
            escrow.submit_milestone(0, "ipfs://too-early")


# ---------------------------------------------------------------------------
# Approval / release
# ---------------------------------------------------------------------------

def test_client_approval_releases_funds_to_freelancer(escrow, funded_client, freelancer, token):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof")
    with boa.env.prank(funded_client):
        escrow.approve_milestone(0)

    assert token.balanceOf(freelancer) == MILESTONE_AMOUNTS[0]
    assert token.balanceOf(escrow.address) == 0
    m0 = escrow.milestones(0)
    assert m0[1] == 4  # RELEASED


def test_only_client_can_approve(escrow, funded_client, freelancer):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof")
        with pytest.raises(Exception):
            escrow.approve_milestone(0)


def test_cannot_approve_before_submission(escrow, funded_client):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)
        with pytest.raises(Exception):
            escrow.approve_milestone(0)


# ---------------------------------------------------------------------------
# Auto-release on timeout
# ---------------------------------------------------------------------------

def test_auto_release_after_review_period_expires(escrow, funded_client, freelancer, token):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof")

    boa.env.time_travel(seconds=REVIEW_PERIOD + 1)

    escrow.claim_after_timeout(0)  # anyone can call this, not just freelancer

    assert token.balanceOf(freelancer) == MILESTONE_AMOUNTS[0]
    m0 = escrow.milestones(0)
    assert m0[1] == 4  # RELEASED


def test_auto_release_reverts_before_review_period_ends(escrow, funded_client, freelancer):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof")

    boa.env.time_travel(seconds=REVIEW_PERIOD - 10)

    with pytest.raises(Exception):
        escrow.claim_after_timeout(0)


def test_client_can_still_approve_before_timeout_instead(escrow, funded_client, freelancer, token):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof")
    with boa.env.prank(funded_client):
        escrow.approve_milestone(0)

    # timeout claim should now fail since it's already RELEASED
    boa.env.time_travel(seconds=REVIEW_PERIOD + 1)
    with pytest.raises(Exception):
        escrow.claim_after_timeout(0)


# ---------------------------------------------------------------------------
# Cancellation / refunds
# ---------------------------------------------------------------------------

def test_cancel_unfunded_milestone_no_refund_needed(escrow, funded_client):
    with boa.env.prank(funded_client):
        escrow.cancel_milestone(0)
    m0 = escrow.milestones(0)
    assert m0[1] == 6  # CANCELLED


def test_cancel_funded_milestone_refunds_client(escrow, funded_client, token):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)
        balance_before = token.balanceOf(funded_client)
        escrow.cancel_milestone(0)

    assert token.balanceOf(funded_client) == balance_before + MILESTONE_AMOUNTS[0]
    assert token.balanceOf(escrow.address) == 0
    m0 = escrow.milestones(0)
    assert m0[1] == 6  # CANCELLED


def test_only_client_can_cancel(escrow, funded_client, freelancer):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)
    with boa.env.prank(freelancer):
        with pytest.raises(Exception):
            escrow.cancel_milestone(0)


def test_cannot_cancel_after_submission(escrow, funded_client, freelancer):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof")
    with boa.env.prank(funded_client):
        with pytest.raises(Exception):
            escrow.cancel_milestone(0)


# ---------------------------------------------------------------------------
# Multi-milestone independence
# ---------------------------------------------------------------------------

def test_milestones_are_independent(escrow, funded_client, freelancer, token):
    with boa.env.prank(funded_client):
        escrow.fund_milestone(0)
        escrow.fund_milestone(1)

    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof-0")

    with boa.env.prank(funded_client):
        escrow.approve_milestone(0)

    # milestone 1 should be untouched - still just FUNDED, not submitted/released
    m1 = escrow.milestones(1)
    assert m1[1] == 1  # FUNDED
    assert token.balanceOf(freelancer) == MILESTONE_AMOUNTS[0]