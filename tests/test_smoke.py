"""Toolchain smoke test: Vyper compiles and Titanoboa can deploy + call."""
import boa


def test_mock_usdc_deploys_and_mints():
    token = boa.load("contracts/MockUSDC.vy")
    user = boa.env.generate_address()

    assert token.decimals() == 6
    token.mint(user, 5 * 10**6)

    assert token.balanceOf(user) == 5 * 10**6
    assert token.totalSupply() == 5 * 10**6
