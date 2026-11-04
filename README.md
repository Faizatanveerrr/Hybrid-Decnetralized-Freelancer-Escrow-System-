# EscrowX – Decentralized Freelancer Escrow

Milestone-based freelance escrow with AI-assisted dispute arbitration.

- `contracts/` – Vyper contracts (`EscrowX.vy`, test token `MockUSDC.vy`)
- `backend/`   – Express + MongoDB API (mirrors the contract rules off-chain)
- `src/`       – React + Vite frontend
- `tests/`     – Titanoboa contract tests

## Run it with Docker (recommended: database included)

```bash
cp .env.example .env        # optional for a first look; needed for blockchain/payments
docker compose up --build   # starts MongoDB + the app
```
Open **http://localhost:5000**. Docker Desktop must be running ("Engine running").
The bundled MongoDB keeps its data in a Docker volume (`mongo-data`), is not
exposed on your PC's ports, and the app waits for it to be healthy before
starting, so there is no startup-order or "disconnected" problem. Stop with
`docker compose down` (add `-v` to also delete the database).
`.env` is passed to the app; its `MONGODB_URI` is deliberately overridden in
`docker-compose.yml` so the app always uses the bundled database.

## Run it without Docker (development, hot reload)

Use this while editing the code.

## Run it (off-chain demo mode)

```bash
cp .env.example .env        # set MONGODB_URI (and optionally GEMINI_API_KEY)
npm install
npm run dev                 # API on :5000, frontend on :3000
```

Without the blockchain settings below, the app runs in the original
database-only mode.

## On-chain INR payments (Sepolia testnet)

Payments are settled by the `EscrowX` smart contract using `MockINR`, a
rupee-pegged **test** token (1 token = Rs 1, 2 decimals). It has no real-world
value. Real INR cannot be moved on a public chain; this is the standard way to
demonstrate rupee settlement.

One-time setup:

1. `npm run wallet:new` - creates the platform **arbitrator** wallet (signs AI
   rulings), a `JWT_SECRET` and a `WALLET_ENCRYPTION_KEY`, and saves them to `.env`.
   Send the printed address some Sepolia test ETH from a faucet.
2. Set `SEPOLIA_RPC_URL` in `.env` (default is a public node; Alchemy/Infura work too).
3. `npm run deploy:token` - deploys MockINR and saves `TOKEN_ADDRESS` to `.env`.
4. Restart `npm run dev`.

### Wallets: managed by default, MetaMask optional

Every new account automatically gets a **platform-managed wallet**: the server
creates the key pair, stores the private key encrypted (AES-256-GCM), and signs
transactions for the user. Users never need MetaMask, and the server sends a
little Sepolia ETH for gas when their wallet is empty. A user who wants to hold
their own keys can switch to MetaMask on the Wallet page (and back again).
Switching is blocked while the user has unfinished on-chain projects.

This is a **custodial** design: the platform holds the keys, which is convenient
but carries security and regulatory responsibility. Login is protected with
signed tokens (JWT), because anyone who could impersonate a user could move the
funds in their managed wallet.

Using it (with MetaMask instead of managed wallets, client and freelancer must use different accounts):

1. Each user clicks *Connect Wallet*. On the Wallet page, *Get test INR* mints Rs 10,000.
2. Client creates a project; the freelancer's proposal is accepted.
3. Client clicks **Deploy escrow contract** on the project page (MetaMask signs).
   The server checks on-chain that the contract matches the project.
4. From here every step is a real transaction with a hash you can open on
   Etherscan: fund (approve + deposit), submit, approve/release, timeout claim,
   raise dispute, appeal, finalize. The AI ruling is signed on-chain by the
   arbitrator wallet.

### Pay with UPI / Paytm (rupees in, INR tokens out)

Optional. Users can add money with UPI (Paytm, PhonePe, GPay...), cards or net
banking via Razorpay. After the gateway confirms the payment, the server verifies
its signature and mints the **same amount of INR tokens** to the user's wallet
(plus a little Sepolia ETH for gas if the wallet is empty). Those tokens are
then spent through the escrow smart contract, so users never need to buy crypto.

1. Create a free Razorpay account, switch the dashboard to **Test Mode**, and copy
   the API keys (Account & Settings -> API Keys).
2. Put them in `.env` as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. Make sure the arbitrator wallet has some Sepolia ETH (it pays the gas drips).
4. Restart `npm run dev`. The Wallet page now shows **Add money (UPI / Paytm)**.

In test mode no real money moves: choose UPI and enter `success@razorpay`.
Going live needs a verified Razorpay business account (KYC) and legal review -
the platform would hold customers' rupees, which is regulated in India. A payout
to the freelancer's bank account is not implemented.

### Withdraw to a UPI ID (rupees out)

A freelancer (or anyone with a balance) clicks **Withdraw to UPI** on the Wallet
page. The INR tokens go back to the platform treasury (taken automatically for
managed wallets; sent from MetaMask otherwise) and the same number of rupees is
paid to their UPI ID, which is linked to their bank account. If the payout fails
or is later reversed, the tokens are returned automatically.

- **No `RAZORPAYX_ACCOUNT_NUMBER` (default): simulated.** The token movement is
  real, but no money is sent. Use this for demos.
- **With `RAZORPAYX_ACCOUNT_NUMBER`: RazorpayX payouts.** Needs a RazorpayX
  account. Test keys use Razorpay's test environment (payouts there often stay
  "processing" and never settle). Live keys send real money.
- **Safety:** live payouts refuse to run while the token has its public test
  faucet, because anyone could otherwise mint free tokens and cash out. Run
  `npm run token:lock-faucet` first. This is the one step that must never be skipped.

Going live also needs: a verified RazorpayX business account, your server's IP
allowlisted at Razorpay, the RazorpayX balance funded from the money your
customers paid, and legal/RBI review - the platform would be moving customers'
rupees. Payouts to bank accounts (IMPS/NEFT) are not implemented; UPI only.

The backend never trusts the browser: it reads the contract and only then
updates the database. Review/appeal windows come from `REVIEW_PERIOD_SECONDS` and
`APPEAL_WINDOW_SECONDS` (short demo defaults).

### "MongoDB is disconnected"

The backend connects to `MONGODB_URI` (default `mongodb://127.0.0.1:27017/escrowx`
if no `.env` exists) and keeps retrying every 5 seconds, so it recovers by itself
once MongoDB is up - no restart needed. If it stays disconnected, read the line
starting `MongoDB connection failed` in the backend terminal: it gives the exact
reason (nothing listening = start Docker/MongoDB; `Authentication failed` = put
the username and password in `MONGODB_URI`). `http://localhost:5000/api/health`
shows the current state.

## Test the contracts

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
npm test                    # contract tests
npm run e2e:local           # optional: JS on-chain flow against a local node
```

Optional full-stack tests (real backend + database + local chain, fake payment gateway):
start `npx hardhat node` (or `anvil`) and a MongoDB, then `npm run test:integration`.
Each run creates a throwaway database named `escrowx_it_<timestamp>`; drop it afterwards.

## Dispute rules (contract and backend agree)

| Situation                              | What happens                                             |
|----------------------------------------|----------------------------------------------------------|
| Dispute                                | Only on a submitted milestone, inside the review period  |
| Ruling confidence >= 70                | Appeal window opens; payout once it closes               |
| Ruling confidence < 70                 | Secondary review mandatory, no appeal                    |
| High-confidence ruling appealed        | Secondary review mandatory                               |
| Secondary ruling                       | Final; overrides the primary ruling                      |

## Known limitations

- Login uses signed 7-day tokens kept in the browser's localStorage; a production app should use httpOnly cookies, password reset and rate limiting.
- Managed-wallet keys live in the database encrypted with one server key. A production system would use a KMS/HSM.
- `backend/services/blockchainService.js` is only used by projects that have not deployed an on-chain escrow (legacy mode); those have no `txHash`.
- Payouts are checked by polling the gateway when the wallet page loads; a production system should also handle the gateway's webhooks.
- The arbitrator is a single platform-controlled key; a production system would use a multisig or oracle network.
- MockINR is a test token. Moving real INR needs a licensed provider and compliance work.
- If the arbitrator never rules, a dispute has no timeout fallback and funds stay locked.
