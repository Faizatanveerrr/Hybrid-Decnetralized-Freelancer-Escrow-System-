import { explorerTxUrl } from "../lib/chain";

export default function TxLog({ entries }) {
  if (entries.length === 0) return null;

  return (
    <div className="mt-10 pt-6 border-t border-border">
      <h3 className="text-xs uppercase tracking-wide text-muted font-mono-tight mb-3">
        Activity
      </h3>
      <ul className="space-y-2">
        {entries.map((e, i) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span className="text-ink">{e.label}</span>
            <a
              href={explorerTxUrl(e.hash)}
              target="_blank"
              rel="noreferrer"
              className="font-mono-tight text-muted hover:text-accent transition-colors"
            >
              {e.hash.slice(0, 10)}… ↗
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
