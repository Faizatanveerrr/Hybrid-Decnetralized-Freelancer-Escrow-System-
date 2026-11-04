"""
Core EscrowX lifecycle: creation, funding, submission, approval,
auto-release on timeout, cancellation/refunds, access control and
multi-milestone independence.
"""
import boa
import pytest

from conftest import (
    APPEAL_WINDOW,
    CANCELLED,
    FUNDED,
    MILESTONE_AMOUNTS,
    PENDING,
    RELEASED,
    REVIEW_PERIOD,
    SPEC_URI,
    SUBMITTED,
)


# --------------------------------------------------------------------------
# Job creation
# --------------------------------------------------------------------------

def test_job_created_with_correct_state(escrow, client, freelancer, arbitrator, token):
    assert escrow.client() == client
    assert escrow.freelancer() == freelancer
    assert escrow.arbitrator() == arbitrator
    assert escrow.token() == token.address
    assert escrow.review_period() == REVIEW_PERIOD
    assert escrow.appeal_window() == APPEAL_WINDOW
    assert escrow.spec_uri() == SPEC_URI
    assert escrow.milestone_count() == 2


def test_milestones_start_pending(escrow):
    for i, amount in enumerate(MILESTONE_AMOUNTS):
        m = escrow.get_milestone(i)
        assert m[0] == amount
        assert m[1] == PENDING
        assert m[2] == 0   # due_date
        assert m[3] == ""  # proof_uri


@pytest.mark.parametrize(
    "kwargs",
    [
        dict(freelancer_is_client=True),
        dict(amounts=[], dates=[]),
        dict(amounts=[0], dates=[0]),
        dict(amounts=[1], dates=[0, 0]),
        dict(review=0),
        dict(appeal=0),
    ],
    ids=["self-dealing", "no-milestones", "zero-amount", "length-mismatch",
         "zero-review", "zero-appeal"],
)
def test_invalid_job_parameters_rejected(client, freelancer, arbitrator, token, kwargs):
    args = (
        client,
        client if kwargs.get("freelancer_is_client") else freelancer,
        arbitrator,
        token.address,
        kwargs.get("review", REVIEW_PERIOD),
        kwargs.get("appeal", APPEAL_WINDOW),
        SPEC_URI,
        kwargs.get("amounts", MILESTONE_AMOUNTS),
        kwargs.get("dates", [0, 0]),
    )
    with pytest.raises(Exception):
        boa.load("contracts/EscrowX.vy", *args)


# --------------------------------------------------------------------------
# Funding
# --------------------------------------------------------------------------

def test_fund_milestone_transfers_usdc_into_escrow(client, escrow, funded_client, token):
    with boa.env.prank(client):
        escrow.fund_milestone(0)

    assert escrow.get_milestone(0)[1] == FUNDED
    assert token.balanceOf(escrow.address) == MILESTONE_AMOUNTS[0]
    assert token.balanceOf(client) == MILESTONE_AMOUNTS[1]


def test_only_client_can_fund(freelancer, outsider, escrow, funded_client):
    for caller in (freelancer, outsider):
        with boa.env.prank(caller):
            with pytest.raises(Exception):
                escrow.fund_milestone(0)


def test_cannot_fund_twice(client, escrow, funded_client):
    with boa.env.prank(client):
        escrow.fund_milestone(0)
        with pytest.raises(Exception):
            escrow.fund_milestone(0)


def test_cannot_fund_without_allowance(client, escrow, token):
    token.mint(client, MILESTONE_AMOUNTS[0])  # minted but never approved
    with boa.env.prank(client):
        with pytest.raises(Exception):
            escrow.fund_milestone(0)
    assert escrow.get_milestone(0)[1] == PENDING


def test_cannot_fund_invalid_milestone(client, escrow, funded_client):
    with boa.env.prank(client):
        with pytest.raises(Exception):
            escrow.fund_milestone(99)


# --------------------------------------------------------------------------
# Submission
# --------------------------------------------------------------------------

def test_freelancer_can_submit_after_funding(client, freelancer, escrow, funded_client):
    with boa.env.prank(client):
        escrow.fund_milestone(0)

    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof-0")

    m = escrow.get_milestone(0)
    assert m[1] == SUBMITTED
    assert m[3] == "ipfs://proof-0"
    assert m[4] == boa.env.evm.patch.timestamp + REVIEW_PERIOD


def test_cannot_submit_unfunded_milestone(freelancer, escrow):
    with boa.env.prank(freelancer):
        with pytest.raises(Exception):
            escrow.submit_milestone(0, "ipfs://proof")


def test_only_freelancer_can_submit(client, outsider, escrow, funded_client):
    with boa.env.prank(client):
        escrow.fund_milestone(0)
    for caller in (client, outsider):
        with boa.env.prank(caller):
            with pytest.raises(Exception):
                escrow.submit_milestone(0, "ipfs://proof")


def test_cannot_submit_after_due_date(client, freelancer, arbitrator, token):
    due = boa.env.evm.patch.timestamp + 1000
    with boa.env.prank(client):
        escrow = boa.load(
            "contracts/EscrowX.vy", client, freelancer, arbitrator, token.address,
            REVIEW_PERIOD, APPEAL_WINDOW, SPEC_URI, [100], [due],
        )
    token.mint(client, 100)
    with boa.env.prank(client):
        token.approve(escrow.address, 100)
        escrow.fund_milestone(0)

    boa.env.time_travel(seconds=1001)
    with boa.env.prank(freelancer):
        with pytest.raises(Exception):
            escrow.submit_milestone(0, "ipfs://late")


# --------------------------------------------------------------------------
# Approval
# --------------------------------------------------------------------------

def test_client_approval_releases_funds_to_freelancer(client, freelancer, submitted, token):
    with boa.env.prank(client):
        submitted.approve_milestone(0)

    assert submitted.get_milestone(0)[1] == RELEASED
    assert token.balanceOf(freelancer) == MILESTONE_AMOUNTS[0]
    assert token.balanceOf(submitted.address) == 0


def test_only_client_can_approve(freelancer, outsider, submitted):
    for caller in (freelancer, outsider):
        with boa.env.prank(caller):
            with pytest.raises(Exception):
                submitted.approve_milestone(0)


def test_cannot_approve_twice(client, submitted):
    with boa.env.prank(client):
        submitted.approve_milestone(0)
        with pytest.raises(Exception):
            submitted.approve_milestone(0)


def test_cannot_approve_unsubmitted_milestone(client, escrow, funded_client):
    with boa.env.prank(client):
        escrow.fund_milestone(0)
        with pytest.raises(Exception):
            escrow.approve_milestone(0)


# --------------------------------------------------------------------------
# Auto-release on timeout
# --------------------------------------------------------------------------

def test_auto_release_after_review_period_expires(freelancer, submitted, token):
    boa.env.time_travel(seconds=REVIEW_PERIOD + 1)

    with boa.env.prank(freelancer):
        submitted.claim_after_timeout(0)

    assert submitted.get_milestone(0)[1] == RELEASED
    assert token.balanceOf(freelancer) == MILESTONE_AMOUNTS[0]


def test_cannot_claim_timeout_early(freelancer, submitted):
    boa.env.time_travel(seconds=REVIEW_PERIOD - 10)
    with boa.env.prank(freelancer):
        with pytest.raises(Exception):
            submitted.claim_after_timeout(0)


def test_only_freelancer_can_claim_timeout(client, outsider, submitted):
    boa.env.time_travel(seconds=REVIEW_PERIOD + 1)
    for caller in (client, outsider):
        with boa.env.prank(caller):
            with pytest.raises(Exception):
                submitted.claim_after_timeout(0)


def test_client_cannot_approve_after_review_period(client, submitted):
    boa.env.time_travel(seconds=REVIEW_PERIOD + 1)
    with boa.env.prank(client):
        with pytest.raises(Exception):
            submitted.approve_milestone(0)


# --------------------------------------------------------------------------
# Cancellation
# --------------------------------------------------------------------------

def test_cancel_unfunded_milestone_no_refund_needed(client, escrow, token):
    with boa.env.prank(client):
        escrow.cancel_milestone(0)

    assert escrow.get_milestone(0)[1] == CANCELLED
    assert token.balanceOf(client) == 0
    assert token.balanceOf(escrow.address) == 0


def test_cancel_funded_milestone_refunds_client(client, escrow, funded_client, token):
    with boa.env.prank(client):
        escrow.fund_milestone(0)
        escrow.cancel_milestone(0)

    assert escrow.get_milestone(0)[1] == CANCELLED
    assert token.balanceOf(client) == sum(MILESTONE_AMOUNTS)
    assert token.balanceOf(escrow.address) == 0


def test_only_client_can_cancel(freelancer, outsider, escrow):
    for caller in (freelancer, outsider):
        with boa.env.prank(caller):
            with pytest.raises(Exception):
                escrow.cancel_milestone(0)


def test_cannot_cancel_submitted_milestone(client, submitted):
    with boa.env.prank(client):
        with pytest.raises(Exception):
            submitted.cancel_milestone(0)


def test_cannot_cancel_twice(client, escrow, funded_client):
    with boa.env.prank(client):
        escrow.fund_milestone(0)
        escrow.cancel_milestone(0)
        with pytest.raises(Exception):
            escrow.cancel_milestone(0)


# --------------------------------------------------------------------------
# Multi-milestone independence
# --------------------------------------------------------------------------

def test_milestones_are_independent(client, freelancer, escrow, funded_client, token):
    with boa.env.prank(client):
        escrow.fund_milestone(0)
        escrow.fund_milestone(1)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://proof-0")
    with boa.env.prank(client):
        escrow.approve_milestone(0)

    assert escrow.get_milestone(0)[1] == RELEASED
    assert escrow.get_milestone(1)[1] == FUNDED
    assert token.balanceOf(freelancer) == MILESTONE_AMOUNTS[0]
    # milestone 1 is still held in escrow
    assert token.balanceOf(escrow.address) == MILESTONE_AMOUNTS[1]
