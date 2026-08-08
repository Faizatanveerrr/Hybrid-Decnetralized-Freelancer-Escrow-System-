# @version 0.4.3
"""
@title Smoke Test Contract
@notice Trivial contract used only to verify the Vyper + Titanoboa toolchain works end-to-end.
         Not part of the final escrow system.
"""

greeting: public(String[100])
owner: public(address)

@deploy
def __init__(initial_greeting: String[100]):
    self.greeting = initial_greeting
    self.owner = msg.sender

@external
def set_greeting(new_greeting: String[100]):
    assert msg.sender == self.owner, "not owner"
    self.greeting = new_greeting
