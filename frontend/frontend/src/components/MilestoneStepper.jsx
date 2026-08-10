import { STATUS } from "../lib/chain";

// Tailwind can't see dynamically-built class names like `bg-${color}` at
// build time (its JIT scanner needs static strings), so status colors are
// resolved to real hex values here and applied via inline style instead.
const HEX = {
  "state-pending": "#8B909B",
  "state-funded": "#FFB020",
  "state-submitted": "#3AA9FF",
  "state-disputed": "#FF5C5C",
  "state-released": "#34D399",
  "state-refunded": "#A78BFA",
  "state-cancelled": "#5C6270",
};

// Renders the milestone lifecycle as a branching diagram, not a linear
// progress bar — because the contract itself branches: SUBMITTED can
// resolve via direct approval OR via the dispute/arbitration path.
//
//   PENDING -> FUNDED -> SUBMITTED -> RELEASED
//                             |
//                             v
//                         DISPUTED -> REFUNDED / RELEASED (via ruling)
//
// CANCELLED branches off PENDING/FUNDED and is shown as a side note
// rather than a main-line node, since it's a terminal exit, not a step.

const MAIN_LINE = [0, 1, 2, 4]; // PENDING, FUNDED, SUBMITTED, RELEASED
const DISPUTE_LINE = [3, 5]; // DISPUTED, REFUNDED

function Node({ id, current, reached, label }) {
  const meta = STATUS[id];
  const hex = HEX[meta.color];
  const isCurrent = current === id;
  return (
    <div className="flex flex-col items-center gap-2 min-w-[92px]">
      <div
        className="w-4 h-4 rounded-full border-2 transition-all duration-300"
        style={{
          backgroundColor: isCurrent ? hex : reached ? `${hex}B3` : "transparent",
          borderColor: isCurrent || reached ? hex : "#2A2E35",
          boxShadow: isCurrent ? "0 0 0 4px rgba(255,255,255,0.06)" : "none",
        }}
        aria-current={isCurrent ? "step" : undefined}
      />
      <span
        className="font-mono-tight text-[11px] tracking-wide uppercase"
        style={{ color: isCurrent ? "#EDEFF2" : reached ? "#8B909B" : "#8B909B80" }}
      >
        {label || meta.name}
      </span>
    </div>
  );
}

function Connector({ active, dashed }) {
  return (
    <div className="flex-1 h-[2px] mt-2 relative min-w-[24px]">
      <div
        className={dashed ? "absolute inset-0 border-t-2 border-dashed" : "absolute inset-0"}
        style={{
          borderColor: dashed ? (active ? "#FF5C5C" : "#2A2E35") : undefined,
          backgroundColor: !dashed ? (active ? "#0052FF" : "#2A2E35") : "transparent",
        }}
      />
    </div>
  );
}

export default function MilestoneStepper({ status }) {
  const onDisputePath = status === 3 || status === 5;
  const mainReachedIdx = MAIN_LINE.indexOf(status);

  return (
    <div className="w-full">
      {/* Main line */}
      <div className="flex items-start">
        {MAIN_LINE.map((id, i) => (
          <div key={id} className="flex items-start flex-1 last:flex-none">
            <Node
              id={id}
              current={status}
              reached={
                (onDisputePath && id <= 2) ||
                (!onDisputePath && mainReachedIdx >= 0 && i <= mainReachedIdx)
              }
            />
            {i < MAIN_LINE.length - 1 && (
              <Connector
                active={
                  (onDisputePath && id <= 1) ||
                  (!onDisputePath && mainReachedIdx > i)
                }
              />
            )}
          </div>
        ))}
      </div>

      {/* Dispute branch, only shown once relevant */}
      {onDisputePath && (
        <div className="flex items-start mt-6 ml-[calc(50%-46px)] max-w-[200px]">
          <div className="flex flex-col items-center mr-3 -mt-8">
            <div className="w-[2px] h-8 bg-state-disputed/60" />
          </div>
          <div className="flex items-start">
            {DISPUTE_LINE.map((id, i) => (
              <div key={id} className="flex items-start">
                <Node id={id} current={status} reached={status === id || (status === 5 && id === 3)} />
                {i < DISPUTE_LINE.length - 1 && (
                  <Connector active={status === 5} dashed />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {status === 6 && (
        <p className="mt-4 font-mono-tight text-[11px] text-state-cancelled uppercase tracking-wide">
          ⊘ cancelled before submission
        </p>
      )}
    </div>
  );
}
