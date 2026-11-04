"""MockINR token + escrow settlement in INR, and the get_ruling view."""
import boa
import pytest

from conftest import APPEAL_WINDOW, HIGH_CONFIDENCE, REVIEW_PERIOD, RELEASED

RUPEE = 100  # 2 decimals


@pytest.fixture
def inr():
    return boa.load("contracts/MockINR.vy")


def test_token_metadata(inr):
    assert inr.name() == "Mock INR"
    assert inr.symbol() == "mINR"
    assert inr.decimals() == 2


def test_faucet_mints_ten_thousand_rupees(inr):
    user = boa.env.generate_address()
    with boa.env.prank(user):
        inr.faucet()
    assert inr.balanceOf(user) == 10_000 * RUPEE


def test_faucet_is_rate_limited(inr):
    user = boa.env.generate_address()
    with boa.env.prank(user):
        inr.faucet()
        with pytest.raises(Exception):
            inr.faucet()
    boa.env.time_travel(seconds=3601)
    with boa.env.prank(user):
        inr.faucet()
    assert inr.balanceOf(user) == 20_000 * RUPEE


def test_only_owner_can_mint(inr):
    user = boa.env.generate_address()
    with boa.env.prank(user):
        with pytest.raises(Exception):
            inr.mint(user, 1)
    inr.mint(user, 5 * RUPEE)  # deployer is the owner
    assert inr.balanceOf(user) == 5 * RUPEE


def test_full_escrow_in_inr_with_ruling_view(inr):
    client = boa.env.generate_address()
    freelancer = boa.env.generate_address()
    arbitrator = boa.env.generate_address()
    amount = 2_500 * RUPEE

    with boa.env.prank(client):
        escrow = boa.load(
            "contracts/EscrowX.vy", client, freelancer, arbitrator, inr.address,
            REVIEW_PERIOD, APPEAL_WINDOW, "escrowx://test", [amount], [0],
        )
        inr.faucet()
        inr.approve(escrow.address, amount)
        escrow.fund_milestone(0)
    assert inr.balanceOf(escrow.address) == amount

    with boa.env.prank(freelancer):
        escrow.submit_milestone(0, "ipfs://p")
    with boa.env.prank(client):
        escrow.raise_dispute(0, "ipfs://e")

    # No ruling yet
    zero = "0x" + "00" * 20
    assert str(escrow.get_ruling(0)[0]) == zero

    with boa.env.prank(arbitrator):
        escrow.submit_ruling(0, freelancer, HIGH_CONFIDENCE, "dispute://1")
    winner, conf, deadline, appealed, secondary = escrow.get_ruling(0)
    assert winner == freelancer and conf == HIGH_CONFIDENCE
    assert deadline == boa.env.evm.patch.timestamp + APPEAL_WINDOW
    assert appealed is False and str(secondary) == zero

    with boa.env.prank(client):
        escrow.appeal_ruling(0)
    assert escrow.get_ruling(0)[3] is True

    with boa.env.prank(arbitrator):
        escrow.submit_secondary_ruling(0, freelancer, "dispute://1/secondary")
    with boa.env.prank(client):
        escrow.finalize_ruling(0)

    assert escrow.get_milestone(0)[1] == RELEASED
    assert inr.balanceOf(freelancer) == amount


def test_faucet_can_be_switched_off_by_owner_only(inr):
    user = boa.env.generate_address()
    assert inr.faucet_enabled() is True

    with boa.env.prank(user):
        with pytest.raises(Exception):
            inr.set_faucet_enabled(False)

    inr.set_faucet_enabled(False)  # deployer is the owner
    assert inr.faucet_enabled() is False
    with boa.env.prank(user):
        with pytest.raises(Exception):
            inr.faucet()
    assert inr.balanceOf(user) == 0

    inr.mint(user, 100 * RUPEE)  # owner mint still works (used after verified payments)
    assert inr.balanceOf(user) == 100 * RUPEE

    inr.set_faucet_enabled(True)
    with boa.env.prank(user):
        inr.faucet()
