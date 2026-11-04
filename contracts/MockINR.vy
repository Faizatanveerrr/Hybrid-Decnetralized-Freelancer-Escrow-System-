#pragma version 0.4.3

"""
@title MockINR
@notice Rupee-pegged ERC20-style TEST token (1 token = Rs 1) for the EscrowX demo.
@dev Uses 2 decimals (paise). Anyone can call faucet() to get test rupees, rate-limited
     per address. Has no real-world value and is not a licensed stablecoin.
"""

owner: public(address)
name: public(String[32])
symbol: public(String[16])
decimals: public(uint8)

totalSupply: public(uint256)

FAUCET_AMOUNT: constant(uint256) = 10_000 * 100   # Rs 10,000 per claim
FAUCET_COOLDOWN: constant(uint256) = 3600          # 1 hour
lastFaucetClaim: public(HashMap[address, uint256])

# The public faucet exists only for demos. It MUST be switched off before the
# token backs any real-money payout (see set_faucet_enabled).
faucet_enabled: public(bool)

balanceOf: public(HashMap[address, uint256])
allowance: public(HashMap[address, HashMap[address, uint256]])


event Transfer:
    sender: indexed(address)
    receiver: indexed(address)
    amount: uint256


event Approval:
    owner: indexed(address)
    spender: indexed(address)
    amount: uint256


@deploy
def __init__():
    self.owner = msg.sender
    self.faucet_enabled = True
    self.name = "Mock INR"
    self.symbol = "mINR"
    self.decimals = 2


@external
def faucet():
    """
    @notice Mint FAUCET_AMOUNT test rupees to the caller (once per cooldown).
    """
    assert self.faucet_enabled, "Faucet disabled"
    last: uint256 = self.lastFaucetClaim[msg.sender]
    assert last == 0 or block.timestamp >= last + FAUCET_COOLDOWN, "Faucet cooldown active"
    self.lastFaucetClaim[msg.sender] = block.timestamp

    self.balanceOf[msg.sender] += FAUCET_AMOUNT
    self.totalSupply += FAUCET_AMOUNT

    log Transfer(
        sender=empty(address),
        receiver=msg.sender,
        amount=FAUCET_AMOUNT
    )


@external
def set_faucet_enabled(_enabled: bool):
    """
    @notice Owner switch for the public faucet. Turn it OFF before any real payouts.
    """
    assert msg.sender == self.owner, "Only owner"
    self.faucet_enabled = _enabled


@external
def mint(
    to: address,
    amount: uint256
):
    assert msg.sender == self.owner, "Only owner"
    assert to != empty(address), "Invalid recipient"

    self.balanceOf[to] += amount
    self.totalSupply += amount

    log Transfer(
        sender=empty(address),
        receiver=to,
        amount=amount
    )


@external
def approve(
    spender: address,
    amount: uint256
) -> bool:

    self.allowance[msg.sender][spender] = amount

    log Approval(
        owner=msg.sender,
        spender=spender,
        amount=amount
    )

    return True


@external
def transfer(
    to: address,
    amount: uint256
) -> bool:

    assert to != empty(address), "Invalid recipient"
    assert self.balanceOf[msg.sender] >= amount, "Insufficient balance"

    self.balanceOf[msg.sender] -= amount
    self.balanceOf[to] += amount

    log Transfer(
        sender=msg.sender,
        receiver=to,
        amount=amount
    )

    return True


@external
def transferFrom(
    from_: address,
    to: address,
    amount: uint256
) -> bool:

    assert to != empty(address), "Invalid recipient"
    assert self.balanceOf[from_] >= amount, "Insufficient balance"

    if msg.sender != from_:
        assert (
            self.allowance[from_][msg.sender] >= amount
        ), "Insufficient allowance"

        self.allowance[from_][msg.sender] -= amount

    self.balanceOf[from_] -= amount
    self.balanceOf[to] += amount

    log Transfer(
        sender=from_,
        receiver=to,
        amount=amount
    )

    return True