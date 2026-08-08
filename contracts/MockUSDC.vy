# @version 0.4.3
"""
@title Mock USDC (testing only)
@notice A minimal ERC20 token used to simulate USDC in local tests.
         NOT for deployment - real deployments use the actual USDC contract address.
"""
from ethereum.ercs import IERC20
implements: IERC20

balanceOf: public(HashMap[address, uint256])
allowance: public(HashMap[address, HashMap[address, uint256]])
totalSupply: public(uint256)
name: public(String[32])
symbol: public(String[8])
decimals: public(uint8)

event Transfer:
    sender: indexed(address)
    receiver: indexed(address)
    value: uint256

event Approval:
    owner: indexed(address)
    spender: indexed(address)
    value: uint256


@deploy
def __init__():
    self.name = "Mock USDC"
    self.symbol = "mUSDC"
    self.decimals = 6


@external
def mint(to: address, amount: uint256):
    """Test-only helper to create tokens out of thin air."""
    self.balanceOf[to] += amount
    self.totalSupply += amount
    log Transfer(sender=empty(address), receiver=to, value=amount)


@external
def transfer(to: address, amount: uint256) -> bool:
    self._transfer(msg.sender, to, amount)
    return True


@external
def transferFrom(owner: address, to: address, amount: uint256) -> bool:
    self.allowance[owner][msg.sender] -= amount
    self._transfer(owner, to, amount)
    return True


@external
def approve(spender: address, amount: uint256) -> bool:
    self.allowance[msg.sender][spender] = amount
    log Approval(owner=msg.sender, spender=spender, value=amount)
    return True


@internal
def _transfer(sender: address, receiver: address, amount: uint256):
    assert self.balanceOf[sender] >= amount, "insufficient balance"
    self.balanceOf[sender] -= amount
    self.balanceOf[receiver] += amount
    log Transfer(sender=sender, receiver=receiver, value=amount)