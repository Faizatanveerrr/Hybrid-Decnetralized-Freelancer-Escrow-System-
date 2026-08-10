import { useEffect, useMemo, useState, useCallback } from "react";
import {
  connectWallet,
  escrowContract,
  usdcContract,
  formatUsdc,
  parseUsdc,
  shortAddr,
  explorerAddressUrl,
  STATUS,
  DEFAULT_ESCROW_ADDRESS,
} from "./lib/chain";
import WalletBar from "./components/WalletBar";
import MilestoneStepper from "./components/MilestoneStepper";
import MilestoneActions from "./components/MilestoneActions";
import CreateJobPanel from "./components/CreateJobPanel";
import TxLog from "./components/TxLog";

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  const [escrowAddress, setEscrowAddress] = useState(DEFAULT_ESCROW_ADDRESS);
  const [contractInfo, setContractInfo] = useState(null); // client/freelancer/arbitrator/count
  const [milestoneIndex, setMilestoneIndex] = useState(0);
  const [milestone, setMilestone] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [infoError, setInfoError] = useState("");
  const [txLog, setTxLog] = useState([]);

  const handleConnect = async () => {
    setConnecting(true);
    setConnectError("");
    try {
      const { provider, signer, address } = await connectWallet();
      setProvider(provider);
      setSigner(signer);
      setAddress(address);
    } catch (e) {
      setConnectError(e.message || "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  };

  const role = useMemo(() => {
    if (!address || !contractInfo) return "other";
    const a = address.toLowerCase();
    if (a === contractInfo.client?.toLowerCase()) return "client";
    if (a === contractInfo.freelancer?.toLowerCase()) return "freelancer";
    if (a === contractInfo.arbitrator?.toLowerCase()) return "arbitrator";
    return "other";
  }, [address, contractInfo]);

  const loadContractInfo = useCallback(async () => {
    if (!provider || !escrowAddress) return;
    setInfoError("");
    try {
      const c = escrowContract(escrowAddress, provider);
      const [client, freelancer, arbitrator, reviewPeriod, count] = await Promise.all([
        c.client(),
        c.freelancer(),
        c.arbitrator(),
        c.review_period(),
        c.milestone_count(),
      ]);
      setContractInfo({
        client,
        freelancer,
        arbitrator,
        reviewPeriod: Number(reviewPeriod),
        count: Number(count),
      });
    } catch (e) {
      console.error("loadContractInfo failed:", e);
      setContractInfo(null);
      setInfoError(
        (e.shortMessage || e.reason || e.message || "Unknown error") +
          " — check that src/lib/EscrowJob.abi.json matches your compiled contract " +
          "(run: vyper -f abi contracts/EscrowJob.vy)."
      );
    }
  }, [provider, escrowAddress]);

  const loadMilestone = useCallback(async () => {
    if (!provider || !escrowAddress) return;
    setLoading(true);
    try {
      const c = escrowContract(escrowAddress, provider);
      const m = await c.milestones(milestoneIndex);
      setMilestone({
        amount: m[0],
        status: Number(m[1]),
        proofUri: m[2],
        submittedAt: Number(m[3]),
        disputedBy: m[4],
        rulingWinner: m[5],
        rulingConfidence: Number(m[6]),
        rulingUri: m[7],
        rulingSubmittedAt: Number(m[8]),
        appealDeadline: Number(m[9]),
        appealed: m[10],
        needsSecondaryReview: m[11],
      });
      setActionError("");
    } catch (e) {
      setActionError(
        (e.shortMessage || e.reason || e.message || "Unknown error") +
          " — check the milestones() output types in EscrowJob.abi.json match your contract."
      );
      console.error("loadMilestone failed:", e);
      setMilestone(null);
    } finally {
      setLoading(false);
    }
  }, [provider, escrowAddress, milestoneIndex]);

  useEffect(() => {
    loadContractInfo();
  }, [loadContractInfo]);

  useEffect(() => {
    loadMilestone();
  }, [loadMilestone]);

  const logTx = (label, hash) => setTxLog((prev) => [{ label, hash }, ...prev].slice(0, 8));

  const withRefresh = (fn) => async () => {
    setActionError("");
    try {
      await fn();
      await loadMilestone();
    } catch (e) {
      setActionError(e.shortMessage || e.reason || e.message || "Transaction failed.");
    }
  };

  const c = () => escrowContract(escrowAddress, signer);

  const handleFund = withRefresh(async () => {
    const usdc = usdcContract(signer);
    const allowance = await usdc.allowance(address, escrowAddress);
    if (allowance < milestone.amount) {
      const approveTx = await usdc.approve(escrowAddress, milestone.amount);
      logTx("Approve USDC spend", approveTx.hash);
      await approveTx.wait();
    }
    const tx = await c().fund_milestone(milestoneIndex);
    logTx("Fund milestone", tx.hash);
    await tx.wait();
  });

  const handleSubmit = (proofUri) =>
    withRefresh(async () => {
      if (!proofUri) throw new Error("Enter a proof URI first.");
      const tx = await c().submit_milestone(milestoneIndex, proofUri);
      logTx("Submit proof", tx.hash);
      await tx.wait();
    })();

  const handleApprove = withRefresh(async () => {
    const tx = await c().approve_milestone(milestoneIndex);
    logTx("Approve & release", tx.hash);
    await tx.wait();
  });

  const handleDispute = withRefresh(async () => {
    const tx = await c().raise_dispute(milestoneIndex);
    logTx("Raise dispute", tx.hash);
    await tx.wait();
  });

  const handleClaimTimeout = withRefresh(async () => {
    const tx = await c().claim_after_timeout(milestoneIndex);
    logTx("Claim after timeout", tx.hash);
    await tx.wait();
  });

  const handleCancel = withRefresh(async () => {
    const tx = await c().cancel_milestone(milestoneIndex);
    logTx("Cancel milestone", tx.hash);
    await tx.wait();
  });

  const handleAppeal = withRefresh(async () => {
    const tx = await c().appeal_ruling(milestoneIndex);
    logTx("Appeal ruling", tx.hash);
    await tx.wait();
  });

  const handleFinalize = withRefresh(async () => {
    const tx = await c().finalize_ruling(milestoneIndex);
    logTx("Finalize ruling", tx.hash);
    await tx.wait();
  });

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-6 py-10">
      <WalletBar
        address={address}
        onConnect={handleConnect}
        connecting={connecting}
        error={connectError}
      />

      <div className="flex items-center justify-between mb-6">
        <div className="flex-1 mr-4">
          <label className="text-xs uppercase tracking-wide text-muted font-mono-tight block mb-1.5">
            Contract address
          </label>
          <input
            value={escrowAddress}
            onChange={(e) => setEscrowAddress(e.target.value.trim())}
            className="input"
            placeholder="0x..."
          />
        </div>
        {signer && (
          <div className="pt-6">
            <CreateJobPanel signer={signer} onDeployed={setEscrowAddress} />
          </div>
        )}
      </div>

      {infoError && (
        <div className="bg-state-disputed/10 border border-state-disputed/30 rounded-md px-4 py-3 mb-6 text-sm text-state-disputed">
          <strong>Couldn't load contract info:</strong> {infoError}
        </div>
      )}

      {contractInfo && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-8 grid grid-cols-3 gap-4 text-sm">
          <InfoField label="Client" value={contractInfo.client} me={role === "client"} />
          <InfoField
            label="Freelancer"
            value={contractInfo.freelancer}
            me={role === "freelancer"}
          />
          <InfoField
            label="Arbitrator"
            value={contractInfo.arbitrator}
            me={role === "arbitrator"}
          />
        </div>
      )}

      {contractInfo && contractInfo.count > 0 && (
        <div className="flex items-center gap-2 mb-8">
          <span className="text-xs uppercase tracking-wide text-muted font-mono-tight">
            Milestone
          </span>
          {Array.from({ length: contractInfo.count }, (_, i) => (
            <button
              key={i}
              onClick={() => setMilestoneIndex(i)}
              className={`w-8 h-8 rounded-md text-sm font-mono-tight transition-colors ${
                milestoneIndex === i
                  ? "bg-accent text-white"
                  : "bg-surface2 text-muted hover:text-ink border border-border"
              }`}
            >
              {i}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-muted">Loading milestone…</p>}

      {!loading && !milestone && actionError && (
        <div className="bg-state-disputed/10 border border-state-disputed/30 rounded-md px-4 py-3 text-sm text-state-disputed">
          {actionError}
        </div>
      )}

      {!loading && milestone && (
        <div className="bg-surface border border-border rounded-lg p-6 md:p-8">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="font-display text-2xl font-semibold">
              {formatUsdc(milestone.amount)} USDC
            </h2>
            <span
              className="font-mono-tight text-xs uppercase tracking-wide px-2 py-1 rounded"
              style={{
                color: statusHex(milestone.status),
                backgroundColor: `${statusHex(milestone.status)}1A`,
              }}
            >
              {STATUS[milestone.status]?.name}
            </span>
          </div>

          <MilestoneStepper status={milestone.status} />

          {milestone.proofUri && (
            <p className="text-sm text-muted mt-8 font-mono-tight break-all">
              Proof: {milestone.proofUri}
            </p>
          )}

          {milestone.status === 3 && milestone.rulingSubmittedAt > 0 && (
            <div className="mt-4 bg-surface2 border border-border rounded-md p-4 text-sm">
              <p className="text-muted mb-1">
                Ruling: winner {shortAddr(milestone.rulingWinner)}, confidence{" "}
                {milestone.rulingConfidence}%
              </p>
              {milestone.appealed && <p className="text-state-funded">Appealed</p>}
              {milestone.needsSecondaryReview && (
                <p className="text-state-submitted">Pending secondary review</p>
              )}
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-border">
            {!address ? (
              <p className="text-sm text-muted">Connect a wallet to take action.</p>
            ) : (
              <MilestoneActions
                status={milestone.status}
                role={role}
                onFund={handleFund}
                onSubmit={handleSubmit}
                onApprove={handleApprove}
                onDispute={handleDispute}
                onClaimTimeout={handleClaimTimeout}
                onCancel={handleCancel}
                onAppeal={handleAppeal}
                onFinalize={handleFinalize}
              />
            )}
            {actionError && (
              <p className="text-sm text-state-disputed mt-4">{actionError}</p>
            )}
          </div>

          <TxLog entries={txLog} />
        </div>
      )}
    </div>
  );
}

function InfoField({ label, value, me }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted font-mono-tight mb-1">
        {label} {me && <span className="text-accent">· you</span>}
      </p>
      <a
        href={value ? explorerAddressUrl(value) : "#"}
        target="_blank"
        rel="noreferrer"
        className="font-mono-tight text-ink hover:text-accent transition-colors"
      >
        {shortAddr(value)}
      </a>
    </div>
  );
}

function statusHex(status) {
  const map = {
    0: "#8B909B",
    1: "#FFB020",
    2: "#3AA9FF",
    3: "#FF5C5C",
    4: "#34D399",
    5: "#A78BFA",
    6: "#5C6270",
  };
  return map[status] || "#8B909B";
}
