"""
Dispute / AI-arbitration flow:

    raise_dispute -> submit_ruling -> (finalize | appeal_ruling)
                  -> submit_secondary_ruling -> finalize_ruling

Rules under test:
  * confidence >= 70: appeal window opens; finalizable after it closes
  * confidence <  70: secondary ruling mandatory, no direct finalize
  * appealed high-confidence ruling: secondary ruling mandatory
  * a secondary ruling overrides the primary one
"""
import boa
import pytest

from conftest import (
    APPEAL_WINDOW,
    DISPUTED,
    HIGH_CONFIDENCE,
    LOW_CONFIDENCE,
    MILESTONE_AMOUNTS,
    REFUNDED,
    RELEASED,
    REVIEW_PERIOD,
    SUBMITTED,
)

AMOUNT = MILESTONE_AMOUNTS[0]


# --------------------------------------------------------------------------
# Raising a dispute
# --------------------------------------------------------------------------

def test_client_can_raise_dispute(client, disputed):
    m = disputed.get_milestone(0)
    assert m[1] == DISPUTED
    assert m[5] == client  # dispute_raised_by


def test_freelancer_can_raise_dispute(freelancer, submitted):
    with boa.env.prank(freelancer):
        submitted.raise_dispute(0, "ipfs://freelancer-evidence")
    m = submitted.get_milestone(0)
    assert m[1] == DISPUTED
    assert m[5] == freelancer


def test_outsider_cannot_raise_dispute(outsider, submitted):
    with boa.env.prank(outsider):
        with pytest.raises(Exception):
            submitted.raise_dispute(0, "ipfs://x")


def test_cannot_dispute_before_submission(client, escrow, funded_client):
    with boa.env.prank(client):
        escrow.fund_milestone(0)
        with pytest.raises(Exception):
            escrow.raise_dispute(0, "ipfs://x")


def test_cannot_dispute_after_review_period(client, submitted):
    """Otherwise a client could front-run the freelancer's timeout claim."""
    boa.env.time_travel(seconds=REVIEW_PERIOD + 1)
    with boa.env.prank(client):
        with pytest.raises(Exception):
            submitted.raise_dispute(0, "ipfs://late")
    assert submitted.get_milestone(0)[1] == SUBMITTED


def test_dispute_blocks_approval_and_timeout_claim(client, freelancer, disputed):
    with boa.env.prank(client):
        with pytest.raises(Exception):
            disputed.approve_milestone(0)
    boa.env.time_travel(seconds=REVIEW_PERIOD + 1)
    with boa.env.prank(freelancer):
        with pytest.raises(Exception):
            disputed.claim_after_timeout(0)


def test_dispute_blocks_cancel(client, disputed):
    with boa.env.prank(client):
        with pytest.raises(Exception):
            disputed.cancel_milestone(0)


# --------------------------------------------------------------------------
# Primary ruling + high-confidence path
# --------------------------------------------------------------------------

def test_only_arbitrator_can_submit_ruling(client, freelancer, disputed):
    for caller in (client, freelancer):
        with boa.env.prank(caller):
            with pytest.raises(Exception):
                disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")


def test_ruling_requires_active_dispute(freelancer, arbitrator, submitted):
    with boa.env.prank(arbitrator):
        with pytest.raises(Exception):
            submitted.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")


def test_ruling_winner_must_be_a_party(outsider, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        with pytest.raises(Exception):
            disputed.submit_ruling(0, outsider, HIGH_CONFIDENCE, "ipfs://r")


def test_confidence_above_100_rejected(freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        with pytest.raises(Exception):
            disputed.submit_ruling(0, freelancer, 101, "ipfs://r")


def test_ruling_cannot_be_overwritten(client, freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r1")
        with pytest.raises(Exception):
            disputed.submit_ruling(0, client, HIGH_CONFIDENCE, "ipfs://r2")


def test_high_confidence_ruling_opens_appeal_window(freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")

    m = disputed.get_milestone(0)
    assert m[1] == DISPUTED                     # not finalized yet
    assert m[6] == freelancer                   # ruling_winner
    assert m[7] == HIGH_CONFIDENCE              # ruling_confidence
    assert m[8] == "ipfs://r"                   # ruling_uri
    assert m[9] == boa.env.evm.patch.timestamp + APPEAL_WINDOW


def test_finalize_reverts_before_appeal_window_closes(freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")
    with pytest.raises(Exception):
        disputed.finalize_ruling(0)


def test_finalize_pays_freelancer_after_window(client, freelancer, arbitrator, disputed, token):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")
    boa.env.time_travel(seconds=APPEAL_WINDOW + 1)

    with boa.env.prank(client):
        disputed.finalize_ruling(0)

    assert token.balanceOf(freelancer) == AMOUNT
    assert disputed.get_milestone(0)[1] == RELEASED


def test_finalize_refunds_client_when_client_wins(client, arbitrator, disputed, token):
    balance_before = token.balanceOf(client)
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, client, HIGH_CONFIDENCE, "ipfs://r")
    boa.env.time_travel(seconds=APPEAL_WINDOW + 1)

    with boa.env.prank(client):
        disputed.finalize_ruling(0)

    assert token.balanceOf(client) == balance_before + AMOUNT
    assert disputed.get_milestone(0)[1] == REFUNDED


def test_outsider_cannot_finalize(freelancer, arbitrator, outsider, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")
    boa.env.time_travel(seconds=APPEAL_WINDOW + 1)
    with boa.env.prank(outsider):
        with pytest.raises(Exception):
            disputed.finalize_ruling(0)


def test_cannot_finalize_twice(client, freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")
    boa.env.time_travel(seconds=APPEAL_WINDOW + 1)
    with boa.env.prank(client):
        disputed.finalize_ruling(0)
        with pytest.raises(Exception):
            disputed.finalize_ruling(0)


def test_cannot_finalize_without_ruling(client, disputed):
    with boa.env.prank(client):
        with pytest.raises(Exception):
            disputed.finalize_ruling(0)


# --------------------------------------------------------------------------
# Low-confidence path: secondary ruling mandatory
# --------------------------------------------------------------------------

def test_low_confidence_has_no_appeal_window(freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, LOW_CONFIDENCE, "ipfs://r")
    assert disputed.get_milestone(0)[9] == 0


def test_low_confidence_cannot_be_finalized_directly(client, freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, LOW_CONFIDENCE, "ipfs://r")
    boa.env.time_travel(seconds=APPEAL_WINDOW + 1)
    with boa.env.prank(client):
        with pytest.raises(Exception):
            disputed.finalize_ruling(0)


def test_low_confidence_cannot_be_appealed(client, freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, LOW_CONFIDENCE, "ipfs://r")
    with boa.env.prank(client):
        with pytest.raises(Exception):
            disputed.appeal_ruling(0)


def test_secondary_ruling_then_finalize_pays_out(client, freelancer, arbitrator, disputed, token):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, LOW_CONFIDENCE, "ipfs://r")
        disputed.submit_secondary_ruling(0, freelancer, "ipfs://final")

    m = disputed.get_milestone(0)
    assert m[10] == freelancer  # secondary_ruling_winner

    with boa.env.prank(client):
        disputed.finalize_ruling(0)  # no appeal-window wait needed

    assert token.balanceOf(freelancer) == AMOUNT
    assert disputed.get_milestone(0)[1] == RELEASED


# --------------------------------------------------------------------------
# Appeal path
# --------------------------------------------------------------------------

def test_party_can_appeal_high_confidence_ruling(client, freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")
    with boa.env.prank(client):
        disputed.appeal_ruling(0)  # must not revert


def test_cannot_finalize_after_appeal(client, freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")
    with boa.env.prank(client):
        disputed.appeal_ruling(0)

    boa.env.time_travel(seconds=APPEAL_WINDOW + 1)
    with boa.env.prank(client):
        with pytest.raises(Exception):
            disputed.finalize_ruling(0)


def test_secondary_ruling_can_overturn_appealed_ruling(client, freelancer, arbitrator, disputed, token):
    balance_before = token.balanceOf(client)
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")
    with boa.env.prank(client):
        disputed.appeal_ruling(0)
    with boa.env.prank(arbitrator):
        disputed.submit_secondary_ruling(0, client, "ipfs://final")
    with boa.env.prank(client):
        disputed.finalize_ruling(0)

    assert token.balanceOf(client) == balance_before + AMOUNT
    assert token.balanceOf(freelancer) == 0
    assert disputed.get_milestone(0)[1] == REFUNDED


def test_cannot_appeal_twice(client, freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")
    with boa.env.prank(client):
        disputed.appeal_ruling(0)
        with pytest.raises(Exception):
            disputed.appeal_ruling(0)


def test_cannot_appeal_after_window_closes(client, freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")
    boa.env.time_travel(seconds=APPEAL_WINDOW + 1)
    with boa.env.prank(client):
        with pytest.raises(Exception):
            disputed.appeal_ruling(0)


def test_outsider_cannot_appeal(freelancer, arbitrator, outsider, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")
    with boa.env.prank(outsider):
        with pytest.raises(Exception):
            disputed.appeal_ruling(0)


def test_cannot_appeal_without_ruling(client, disputed):
    with boa.env.prank(client):
        with pytest.raises(Exception):
            disputed.appeal_ruling(0)


# --------------------------------------------------------------------------
# Secondary-ruling guard rails (regression tests for the arbitrator bypass)
# --------------------------------------------------------------------------

def test_secondary_ruling_requires_primary_ruling(freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        with pytest.raises(Exception):
            disputed.submit_secondary_ruling(0, freelancer, "ipfs://x")


def test_secondary_ruling_not_allowed_for_unappealed_high_confidence(client, freelancer, arbitrator, disputed):
    """The arbitrator must not be able to skip the appeal window."""
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")
        with pytest.raises(Exception):
            disputed.submit_secondary_ruling(0, client, "ipfs://x")


def test_only_arbitrator_can_submit_secondary_ruling(client, freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, LOW_CONFIDENCE, "ipfs://r")
    for caller in (client, freelancer):
        with boa.env.prank(caller):
            with pytest.raises(Exception):
                disputed.submit_secondary_ruling(0, freelancer, "ipfs://x")


def test_secondary_ruling_only_once(client, freelancer, arbitrator, disputed):
    with boa.env.prank(arbitrator):
        disputed.submit_ruling(0, freelancer, LOW_CONFIDENCE, "ipfs://r")
        disputed.submit_secondary_ruling(0, freelancer, "ipfs://s1")
        with pytest.raises(Exception):
            disputed.submit_secondary_ruling(0, client, "ipfs://s2")


# --------------------------------------------------------------------------
# Funds accounting
# --------------------------------------------------------------------------

def test_only_disputed_milestone_is_locked(client, freelancer, arbitrator, escrow, funded_client, token):
    """Disputing milestone 0 must not affect funded milestone 1."""
    with boa.env.prank(client):
        escrow.fund_milestone(0)
        escrow.fund_milestone(1)
    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://p")
    with boa.env.prank(client):
        escrow.raise_dispute(0, "ipfs://e")
    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "ipfs://r")
    boa.env.time_travel(seconds=APPEAL_WINDOW + 1)
    with boa.env.prank(client):
        escrow.finalize_ruling(0)

    assert token.balanceOf(freelancer) == MILESTONE_AMOUNTS[0]
    assert token.balanceOf(escrow.address) == MILESTONE_AMOUNTS[1]
