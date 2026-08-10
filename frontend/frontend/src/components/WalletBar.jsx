import { shortAddr } from "../lib/chain";

export default function WalletBar({ address, onConnect, connecting, error }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-6 mb-8">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">
          Escrow <span className="text-muted font-normal">/ Base Sepolia</span>
        </h1>
        <p className="text-sm text-muted mt-1">
          Milestone-based freelance payments with AI arbitration
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        {address ? (
          <div className="flex items-center gap-2 bg-surface2 border border-border rounded-full px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-state-released" />
            <span className="font-mono-tight text-sm">{shortAddr(address)}</span>
          </div>
        ) : (
          <button
            onClick={onConnect}
            disabled={connecting}
            className="bg-accent hover:bg-accentSoft text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {connecting ? "Connecting…" : "Connect wallet"}
          </button>
        )}
        {error && <p className="text-xs text-state-disputed max-w-xs text-right">{error}</p>}
      </div>
    </div>
  );
}
