import React from 'react';

export default function StatusBadge({ status, size = 'sm' }) {
  const norm = (status || '').toUpperCase();

  const styles = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200/60',
    FUNDED: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
    SUBMITTED: 'bg-sky-50 text-sky-700 border-sky-200/60',
    DISPUTED: 'bg-rose-50 text-rose-700 border-rose-200/60',
    UNDER_AI_REVIEW: 'bg-purple-50 text-purple-700 border-purple-200/60',
    RULING_GENERATED: 'bg-violet-50 text-violet-700 border-violet-200/60',
    APPEAL_PERIOD: 'bg-orange-50 text-orange-700 border-orange-200/60',
    FINALIZED: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    RELEASED: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    REFUNDED: 'bg-slate-100 text-slate-700 border-slate-200',
    CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
    ACTIVE: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
    OPEN: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    REJECTED: 'bg-rose-50 text-rose-700 border-rose-200/60',
    COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
  };

  const labels = {
    PENDING: 'Pending',
    FUNDED: 'Escrow Funded',
    SUBMITTED: 'Work Submitted',
    DISPUTED: 'Disputed',
    UNDER_AI_REVIEW: 'AI Reviewing',
    RULING_GENERATED: 'Ruling Ready',
    APPEAL_PERIOD: 'Appeal Window',
    FINALIZED: 'Resolved',
    RELEASED: 'Funds Released',
    REFUNDED: 'Refunded',
    CANCELLED: 'Cancelled',
    ACTIVE: 'Active Project',
    OPEN: 'Open for Proposals',
    ACCEPTED: 'Accepted',
    REJECTED: 'Rejected',
    COMPLETED: 'Completed'
  };

  const currentStyle = styles[norm] || 'bg-slate-100 text-slate-700 border-slate-200';
  const label = labels[norm] || status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${currentStyle} ${
        size === 'lg' ? 'px-3.5 py-1 text-sm' : size === 'md' ? 'px-3 py-0.5 text-xs' : 'px-2.5 py-0.5 text-[11px]'
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
      {label}
    </span>
  );
}
