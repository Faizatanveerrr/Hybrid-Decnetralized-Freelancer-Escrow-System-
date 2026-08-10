import { useState } from "react";

// One button per valid next action for the CURRENT status + the
// CONNECTED wallet's role. Nothing here promises an action that would
// just revert on-chain — mirrors the contract's own assert statements.

function ActionButton({ label, onClick, busy, variant = "primary" }) {
  const styles = {
    primary: "bg-accent hover:bg-accentSoft text-white",
    danger: "bg-state-disputed/90 hover:bg-state-disputed text-white",
    ghost: "bg-surface2 hover:bg-surface2/70 text-ink border border-border",
  };
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]}`}
    >
      {busy ? "Confirming…" : label}
    </button>
  );
}

export default function MilestoneActions({
  status,
  role, // "client" | "freelancer" | "arbitrator" | "other"
  onFund,
  onSubmit,
  onApprove,
  onDispute,
  onClaimTimeout,
  onCancel,
  onAppeal,
  onFinalize,
}) {
  const [proofUri, setProofUri] = useState("");
  const [busyKey, setBusyKey] = useState(null);

  const run = async (key, fn) => {
    setBusyKey(key);
    try {
      await fn();
    } finally {
      setBusyKey(null);
    }
  };

  const nothingAvailable = (
    <p className="text-sm text-muted">
      No actions available for your connected wallet at this milestone status.
    </p>
  );

  if (status === 0) {
    // PENDING
    if (role !== "client") return nothingAvailable;
    return (
      <div className="flex flex-wrap gap-3">
        <ActionButton
          label="Fund milestone"
          busy={busyKey === "fund"}
          onClick={() => run("fund", onFund)}
        />
        <ActionButton
          label="Cancel"
          variant="ghost"
          busy={busyKey === "cancel"}
          onClick={() => run("cancel", onCancel)}
        />
      </div>
    );
  }

  if (status === 1) {
    // FUNDED
    if (role === "client") {
      return (
        <div className="flex flex-wrap gap-3">
          <ActionButton
            label="Cancel & refund"
            variant="ghost"
            busy={busyKey === "cancel"}
            onClick={() => run("cancel", onCancel)}
          />
        </div>
      );
    }
    if (role === "freelancer") {
      return (
        <div className="flex flex-col gap-3 max-w-md">
          <label className="text-xs uppercase tracking-wide text-muted font-mono-tight">
            Proof URI (IPFS)
          </label>
          <input
            value={proofUri}
            onChange={(e) => setProofUri(e.target.value)}
            placeholder="ipfs://..."
            className="bg-surface2 border border-border rounded-md px-3 py-2 text-sm font-mono-tight focus:border-accent outline-none"
          />
          <ActionButton
            label="Submit proof of work"
            busy={busyKey === "submit"}
            onClick={() => run("submit", () => onSubmit(proofUri))}
          />
        </div>
      );
    }
    return nothingAvailable;
  }

  if (status === 2) {
    // SUBMITTED
    if (role === "client") {
      return (
        <div className="flex flex-wrap gap-3">
          <ActionButton
            label="Approve & release payment"
            busy={busyKey === "approve"}
            onClick={() => run("approve", onApprove)}
          />
          <ActionButton
            label="Raise dispute"
            variant="danger"
            busy={busyKey === "dispute"}
            onClick={() => run("dispute", onDispute)}
          />
        </div>
      );
    }
    if (role === "freelancer") {
      return (
        <div className="flex flex-wrap gap-3">
          <ActionButton
            label="Raise dispute"
            variant="danger"
            busy={busyKey === "dispute"}
            onClick={() => run("dispute", onDispute)}
          />
          <ActionButton
            label="Claim after timeout"
            variant="ghost"
            busy={busyKey === "timeout"}
            onClick={() => run("timeout", onClaimTimeout)}
          />
        </div>
      );
    }
    return nothingAvailable;
  }

  if (status === 3) {
    // DISPUTED
    if (role === "arbitrator") {
      return (
        <p className="text-sm text-muted">
          Submit a ruling via the arbitration script — this is left to{" "}
          <code className="font-mono-tight text-ink">ai_arbitrate.py</code> rather
          than the UI, so the AI evaluation stays server-side.
        </p>
      );
    }
    if (role === "client" || role === "freelancer") {
      return (
        <div className="flex flex-wrap gap-3">
          <ActionButton
            label="Appeal ruling"
            variant="ghost"
            busy={busyKey === "appeal"}
            onClick={() => run("appeal", onAppeal)}
          />
          <ActionButton
            label="Finalize (after appeal window)"
            variant="ghost"
            busy={busyKey === "finalize"}
            onClick={() => run("finalize", onFinalize)}
          />
        </div>
      );
    }
    return nothingAvailable;
  }

  return (
    <p className="text-sm text-muted">
      This milestone has reached a terminal state — no further actions apply.
    </p>
  );
}
