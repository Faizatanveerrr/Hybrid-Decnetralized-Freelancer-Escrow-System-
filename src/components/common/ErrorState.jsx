import React from 'react';
import Button from './Button.jsx';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function ErrorState({
  title = 'Unable to load data',
  message = 'An unexpected error occurred while fetching information.',
  onRetry
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-rose-50/50 rounded-2xl border border-rose-100">
      <div className="w-12 h-12 rounded-2xl bg-rose-100/80 text-rose-600 flex items-center justify-center mb-3">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-rose-950">{title}</h3>
      <p className="mt-1 text-sm text-rose-700 max-w-md">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button onClick={onRetry} variant="outline" size="sm" icon={RotateCcw}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}
