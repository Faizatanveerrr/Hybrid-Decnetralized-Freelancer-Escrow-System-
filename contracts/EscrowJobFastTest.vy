# @version 0.4.3
"""
@title Freelancer Escrow Job
@notice Holds one client-freelancer job with multiple USDC-funded milestones.
         Each milestone moves through:
           PENDING -> FUNDED -> SUBMITTED -> RELEASED
                                    |            ^
                                    v            |
                                DISPUTED ---------+---> REFUNDED
         (or PENDING/FUNDED -> CANCELLED before submission)
@dev    Disputes are resolved by an off-chain AI arbitration agent. The
         arbitrator address is the only account allowed to submit rulings.
         Low-confidence rulings automatically require a secondary review;
         high-confidence rulings open an appeal window before finalizing.
"""
from ethereum.ercs import IERC20

# ---------------------------------------------------------------------------
# Milestone status constants
# ---------------------------------------------------------------------------
PENDING: constant(uint8) = 0    # created, not yet funded
FUNDED: constant(uint8) = 1     # client deposited funds, waiting on freelancer
SUBMITTED: constant(uint8) = 2  # freelancer submitted proof, waiting on client
DISPUTED: constant(uint8) = 3   # dispute raised, awaiting AI arbitration
RELEASED: constant(uint8) = 4   # paid out to freelancer (approved, timeout, or dispute win)
REFUNDED: constant(uint8) = 5   # paid back to client via dispute win
CANCELLED: constant(uint8) = 6  # cancelled by client before submission, refunded if funded

MAX_MILESTONES: constant(uint256) = 20
CONFIDENCE_THRESHOLD: constant(uint256) = 70   # out of 100; below this, secondary review is forced
APPEAL_PERIOD: constant(uint256) = 60  # 3 days


struct Milestone:
    amount: uint256
    status: uint8
    proof_uri: String[256]
    submitted_at: uint256
    # --- dispute / arbitration fields ---
    disputed_by: address
    ruling_winner: address
    ruling_confidence: uint256
    ruling_uri: String[256]
    ruling_submitted_at: uint256
    appeal_deadline: uint256
    appealed: bool
    needs_secondary_review: bool


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
client: public(address)
freelancer: public(address)
token: public(address)           # ERC20 token used for payment (e.g. USDC)
review_period: public(uint256)   # seconds the client has to approve/dispute after submission
arbitrator: public(address)      # off-chain AI arbitration service's wallet

milestones: public(HashMap[uint256, Milestone])
milestone_count: public(uint256)


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
event JobCreated:
    client: address
    freelancer: address
    token: address
    milestone_count: uint256

event MilestoneFunded:
    milestone_id: uint256
    amount: uint256

event MilestoneSubmitted:
    milestone_id: uint256
    proof_uri: String[256]

event MilestoneApproved:
    milestone_id: uint256
    amount: uint256

event MilestoneAutoReleased:
    milestone_id: uint256
    amount: uint256

event MilestoneCancelled:
    milestone_id: uint256
    refunded_amount: uint256

event DisputeRaised:
    milestone_id: uint256
    raised_by: address

event RulingSubmitted:
    milestone_id: uint256
    winner: address
    confidence: uint256
    ruling_uri: String[256]
    needs_secondary_review: bool

event RulingAppealed:
    milestone_id: uint256
    appealed_by: address

event SecondaryRulingSubmitted:
    milestone_id: uint256
    winner: address
    confidence: uint256
    ruling_uri: String[256]

event DisputeResolved:
    milestone_id: uint256
    winner: address
    amount: uint256
    via_secondary_review: bool


# ---------------------------------------------------------------------------
# Constructor
# ---------------------------------------------------------------------------
@deploy
def __init__(
    freelancer: address,
    token: address,
    arbitrator: address,
    review_period: uint256,
    milestone_amounts: DynArray[uint256, MAX_MILESTONES],
):
    assert freelancer != empty(address), "invalid freelancer address"
    assert freelancer != msg.sender, "client and freelancer must differ"
    assert token != empty(address), "invalid token address"
    assert arbitrator != empty(address), "invalid arbitrator address"
    assert arbitrator != msg.sender and arbitrator != freelancer, "arbitrator must be independent"
    assert review_period > 0, "review period must be positive"
    assert len(milestone_amounts) > 0, "at least one milestone required"

    self.client = msg.sender
    self.freelancer = freelancer
    self.token = token
    self.arbitrator = arbitrator
    self.review_period = review_period

    for amount: uint256 in milestone_amounts:
        assert amount > 0, "milestone amount must be positive"
        self.milestones[self.milestone_count] = Milestone(
            amount=amount,
            status=PENDING,
            proof_uri="",
            submitted_at=0,
            disputed_by=empty(address),
            ruling_winner=empty(address),
            ruling_confidence=0,
            ruling_uri="",
            ruling_submitted_at=0,
            appeal_deadline=0,
            appealed=False,
            needs_secondary_review=False,
        )
        self.milestone_count += 1

    log JobCreated(
        client=self.client,
        freelancer=freelancer,
        token=token,
        milestone_count=self.milestone_count,
    )


# ---------------------------------------------------------------------------
# Client funds a milestone (pulls USDC from client into this contract)
# ---------------------------------------------------------------------------
@external
def fund_milestone(milestone_id: uint256):
    assert msg.sender == self.client, "only client can fund"
    assert milestone_id < self.milestone_count, "invalid milestone id"

    m: Milestone = self.milestones[milestone_id]
    assert m.status == PENDING, "milestone not in pending state"

    success: bool = extcall IERC20(self.token).transferFrom(msg.sender, self, m.amount)
    assert success, "USDC transferFrom failed"

    m.status = FUNDED
    self.milestones[milestone_id] = m
    log MilestoneFunded(milestone_id=milestone_id, amount=m.amount)


# ---------------------------------------------------------------------------
# Freelancer submits proof of work for a funded milestone
# ---------------------------------------------------------------------------
@external
def submit_milestone(milestone_id: uint256, proof_uri: String[256]):
    assert msg.sender == self.freelancer, "only freelancer can submit"
    assert milestone_id < self.milestone_count, "invalid milestone id"

    m: Milestone = self.milestones[milestone_id]
    assert m.status == FUNDED, "milestone not funded"

    m.proof_uri = proof_uri
    m.submitted_at = block.timestamp
    m.status = SUBMITTED
    self.milestones[milestone_id] = m
    log MilestoneSubmitted(milestone_id=milestone_id, proof_uri=proof_uri)


# ---------------------------------------------------------------------------
# Client approves submitted work -> immediate payment release
# ---------------------------------------------------------------------------
@external
def approve_milestone(milestone_id: uint256):
    assert msg.sender == self.client, "only client can approve"
    assert milestone_id < self.milestone_count, "invalid milestone id"

    m: Milestone = self.milestones[milestone_id]
    assert m.status == SUBMITTED, "milestone not awaiting approval"

    m.status = RELEASED
    self.milestones[milestone_id] = m

    success: bool = extcall IERC20(self.token).transfer(self.freelancer, m.amount)
    assert success, "USDC transfer failed"
    log MilestoneApproved(milestone_id=milestone_id, amount=m.amount)


# ---------------------------------------------------------------------------
# Anyone can trigger auto-release once the review period has expired
# without the client approving or disputing.
# ---------------------------------------------------------------------------
@external
def claim_after_timeout(milestone_id: uint256):
    assert milestone_id < self.milestone_count, "invalid milestone id"

    m: Milestone = self.milestones[milestone_id]
    assert m.status == SUBMITTED, "milestone not awaiting approval"
    assert block.timestamp >= m.submitted_at + self.review_period, "review period not yet over"

    m.status = RELEASED
    self.milestones[milestone_id] = m

    success: bool = extcall IERC20(self.token).transfer(self.freelancer, m.amount)
    assert success, "USDC transfer failed"
    log MilestoneAutoReleased(milestone_id=milestone_id, amount=m.amount)


# ---------------------------------------------------------------------------
# Client cancels a milestone before the freelancer has submitted work.
# ---------------------------------------------------------------------------
@external
def cancel_milestone(milestone_id: uint256):
    assert msg.sender == self.client, "only client can cancel"
    assert milestone_id < self.milestone_count, "invalid milestone id"

    m: Milestone = self.milestones[milestone_id]
    assert m.status == PENDING or m.status == FUNDED, "cannot cancel after submission"

    refund_amount: uint256 = 0
    if m.status == FUNDED:
        refund_amount = m.amount

    m.status = CANCELLED
    self.milestones[milestone_id] = m

    if refund_amount > 0:
        success: bool = extcall IERC20(self.token).transfer(self.client, refund_amount)
        assert success, "USDC refund failed"

    log MilestoneCancelled(milestone_id=milestone_id, refunded_amount=refund_amount)


# ---------------------------------------------------------------------------
# DISPUTE FLOW
# ---------------------------------------------------------------------------

@external
def raise_dispute(milestone_id: uint256):
    """Either party can dispute a submitted milestone before it's approved/released."""
    assert msg.sender == self.client or msg.sender == self.freelancer, "only client or freelancer"
    assert milestone_id < self.milestone_count, "invalid milestone id"

    m: Milestone = self.milestones[milestone_id]
    assert m.status == SUBMITTED, "milestone not awaiting approval"

    m.status = DISPUTED
    m.disputed_by = msg.sender
    self.milestones[milestone_id] = m
    log DisputeRaised(milestone_id=milestone_id, raised_by=msg.sender)


@external
def submit_ruling(milestone_id: uint256, winner: address, confidence: uint256, ruling_uri: String[256]):
    """Primary AI ruling. High-confidence rulings open an appeal window;
    low-confidence rulings are automatically routed to secondary review."""
    assert msg.sender == self.arbitrator, "only arbitrator"
    assert milestone_id < self.milestone_count, "invalid milestone id"

    m: Milestone = self.milestones[milestone_id]
    assert m.status == DISPUTED, "milestone not disputed"
    assert m.ruling_submitted_at == 0, "ruling already submitted"
    assert winner == self.client or winner == self.freelancer, "winner must be client or freelancer"
    assert confidence <= 100, "confidence must be 0-100"

    m.ruling_winner = winner
    m.ruling_confidence = confidence
    m.ruling_uri = ruling_uri
    m.ruling_submitted_at = block.timestamp

    needs_secondary: bool = confidence < CONFIDENCE_THRESHOLD
    m.needs_secondary_review = needs_secondary
    if not needs_secondary:
        m.appeal_deadline = block.timestamp + APPEAL_PERIOD

    self.milestones[milestone_id] = m
    log RulingSubmitted(
        milestone_id=milestone_id,
        winner=winner,
        confidence=confidence,
        ruling_uri=ruling_uri,
        needs_secondary_review=needs_secondary,
    )


@external
def appeal_ruling(milestone_id: uint256):
    """Either party can appeal a high-confidence ruling within the appeal window,
    forcing it into secondary review instead of auto-finalizing."""
    assert msg.sender == self.client or msg.sender == self.freelancer, "only client or freelancer"
    assert milestone_id < self.milestone_count, "invalid milestone id"

    m: Milestone = self.milestones[milestone_id]
    assert m.status == DISPUTED, "milestone not disputed"
    assert m.ruling_submitted_at != 0, "no ruling to appeal"
    assert not m.needs_secondary_review, "ruling already requires secondary review"
    assert not m.appealed, "ruling already appealed"
    assert block.timestamp <= m.appeal_deadline, "appeal window closed"

    m.appealed = True
    self.milestones[milestone_id] = m
    log RulingAppealed(milestone_id=milestone_id, appealed_by=msg.sender)


@external
def submit_secondary_ruling(milestone_id: uint256, winner: address, confidence: uint256, ruling_uri: String[256]):
    """Final, binding ruling. Executes payout immediately. Only reachable
    for milestones that needed secondary review or were appealed."""
    assert msg.sender == self.arbitrator, "only arbitrator"
    assert milestone_id < self.milestone_count, "invalid milestone id"

    m: Milestone = self.milestones[milestone_id]
    assert m.status == DISPUTED, "milestone not disputed"
    assert m.needs_secondary_review or m.appealed, "secondary review not required"
    assert winner == self.client or winner == self.freelancer, "winner must be client or freelancer"
    assert confidence <= 100, "confidence must be 0-100"

    m.ruling_winner = winner
    m.ruling_confidence = confidence
    m.ruling_uri = ruling_uri

    if winner == self.freelancer:
        m.status = RELEASED
    else:
        m.status = REFUNDED
    self.milestones[milestone_id] = m

    success: bool = extcall IERC20(self.token).transfer(winner, m.amount)
    assert success, "payout transfer failed"

    log SecondaryRulingSubmitted(milestone_id=milestone_id, winner=winner, confidence=confidence, ruling_uri=ruling_uri)
    log DisputeResolved(milestone_id=milestone_id, winner=winner, amount=m.amount, via_secondary_review=True)


@external
def finalize_ruling(milestone_id: uint256):
    """Anyone can finalize a high-confidence, unappealed ruling once the
    appeal window has closed, releasing funds to the ruled winner."""
    assert milestone_id < self.milestone_count, "invalid milestone id"

    m: Milestone = self.milestones[milestone_id]
    assert m.status == DISPUTED, "milestone not disputed"
    assert m.ruling_submitted_at != 0, "no ruling submitted"
    assert not m.needs_secondary_review, "ruling requires secondary review"
    assert not m.appealed, "ruling was appealed, awaiting secondary review"
    assert block.timestamp > m.appeal_deadline, "appeal window still open"

    winner: address = m.ruling_winner
    if winner == self.freelancer:
        m.status = RELEASED
    else:
        m.status = REFUNDED
    self.milestones[milestone_id] = m

    success: bool = extcall IERC20(self.token).transfer(winner, m.amount)
    assert success, "payout transfer failed"

    log DisputeResolved(milestone_id=milestone_id, winner=winner, amount=m.amount, via_secondary_review=False)