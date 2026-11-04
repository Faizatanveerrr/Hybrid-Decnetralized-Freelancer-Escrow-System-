import React from 'react';
import Button from './Button.jsx';
import {
  FolderPlus,
  Inbox,
  Scale,
  Clock,
  History,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function EmptyState({
  title = 'No records found',
  description = 'There is currently no data stored in the database.',
  actionLabel,
  onAction,
  icon: Icon = FolderPlus,
  className = ''
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center bg-white rounded-2xl border border-dashed border-slate-200 ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3.5 shadow-sm">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-base font-bold text-slate-800">{title}</h3>
      {description && <p className="mt-1 text-xs text-slate-500 max-w-sm leading-relaxed">{description}</p>}
      {actionLabel && onAction && (
        <div className="mt-5">
          <Button onClick={onAction} size="sm">
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
