"""
Smoke test: confirms Vyper compiles and Titanoboa can deploy + interact
with a contract on an in-memory EVM. This is just toolchain verification,
not a real escrow test.
"""
import boa
import pytest


@pytest.fixture
def hello_contract():
    return boa.load("contracts/HelloEscrow.vy", "hello world")


def test_initial_greeting(hello_contract):
    assert hello_contract.greeting() == "hello world"


def test_owner_is_deployer(hello_contract):
    assert hello_contract.owner() == boa.env.eoa


def test_set_greeting_by_owner(hello_contract):
    hello_contract.set_greeting("updated")
    assert hello_contract.greeting() == "updated"


def test_set_greeting_rejected_for_non_owner(hello_contract):
    attacker = boa.env.generate_address()
    with boa.env.prank(attacker):
        with pytest.raises(Exception):
            hello_contract.set_greeting("hacked")
