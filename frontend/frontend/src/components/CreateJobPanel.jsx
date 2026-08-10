import { useState } from "react";
import { ethers } from "ethers";
import EscrowAbi from "../lib/EscrowJob.abi.json";
import { ESCROW_BYTECODE, USDC_ADDRESS, parseUsdc } from "../lib/chain";

export default function CreateJobPanel({ signer, onDeployed }) {
  const [open, setOpen] = useState(false);
  const [freelancer, setFreelancer] = useState("");
  const [arbitrator, setArbitrator] = useState("");
  const [reviewDays, setReviewDays] = useState("7");
  const [amounts, setAmounts] = useState("10, 20");
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  const missingBytecode = !ESCROW_BYTECODE;

  const handleDeploy = async () => {
    setError("");
    if (missingBytecode) {
      setError(
        "Contract bytecode not configured. Run `vyper -f bytecode contracts/EscrowJob.vy` " +
          "and set VITE_ESCROW_BYTECODE in frontend/.env, then restart the dev server."
      );
      return;
    }
    if (!ethers.isAddress(freelancer) || !ethers.isAddress(arbitrator)) {
      setError("Freelancer and arbitrator must be valid addresses.");
      return;
    }
    const milestoneAmounts = amounts
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => parseUsdc(n));

    if (milestoneAmounts.length === 0) {
      setError("Enter at least one milestone amount, comma-separated (e.g. 10, 20).");
      return;
    }

    setDeploying(true);
    try {
      const factory = new ethers.ContractFactory(EscrowAbi, ESCROW_BYTECODE, signer);
      // Confirmed live constructor order: freelancer, token, arbitrator,
      // review_period, milestone_amounts — see PROJECT_STATUS.md §3.6.
      const reviewPeriodSeconds = BigInt(Math.round(parseFloat(reviewDays) * 86400));
      const contract = await factory.deploy(
        freelancer,
        USDC_ADDRESS,
        arbitrator,
        reviewPeriodSeconds,
        milestoneAmounts
      );
      setTxHash(contract.deploymentTransaction()?.hash || "");
      await contract.waitForDeployment();
      const address = await contract.getAddress();
      onDeployed(address);
      setOpen(false);
    } catch (e) {
      setError(e.shortMessage || e.message || "Deployment failed.");
    } finally {
      setDeploying(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-accent hover:text-accentSoft transition-colors"
      >
        + Create new job
      </button>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-base font-semibold">Create job</h2>
        <button onClick={() => setOpen(false)} className="text-muted hover:text-ink text-sm">
          Cancel
        </button>
      </div>

      {missingBytecode && (
        <div className="bg-state-funded/10 border border-state-funded/30 rounded-md px-4 py-3 mb-4 text-sm text-state-funded">
          Contract bytecode isn't configured yet. Run{" "}
          <code className="font-mono-tight">vyper -f bytecode contracts/EscrowJob.vy</code> and
          set <code className="font-mono-tight">VITE_ESCROW_BYTECODE</code> in{" "}
          <code className="font-mono-tight">frontend/.env</code>.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <Field label="Freelancer address">
          <input
            value={freelancer}
            onChange={(e) => setFreelancer(e.target.value)}
            placeholder="0x..."
            className="input"
          />
        </Field>
        <Field label="Arbitrator address">
          <input
            value={arbitrator}
            onChange={(e) => setArbitrator(e.target.value)}
            placeholder="0x..."
            className="input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Review period (days)">
            <input
              value={reviewDays}
              onChange={(e) => setReviewDays(e.target.value)}
              type="number"
              min="0"
              step="0.001"
              className="input"
            />
          </Field>
          <Field label="Milestone amounts (USDC, comma-separated)">
            <input
              value={amounts}
              onChange={(e) => setAmounts(e.target.value)}
              placeholder="10, 20"
              className="input"
            />
          </Field>
        </div>
      </div>

      {error && <p className="text-sm text-state-disputed mt-4">{error}</p>}
      {txHash && (
        <p className="text-sm text-muted mt-4 font-mono-tight">
          Deploying — tx {txHash.slice(0, 10)}…
        </p>
      )}

      <button
        onClick={handleDeploy}
        disabled={deploying}
        className="mt-5 bg-accent hover:bg-accentSoft text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50"
      >
        {deploying ? "Deploying…" : "Deploy contract"}
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-muted font-mono-tight block mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
