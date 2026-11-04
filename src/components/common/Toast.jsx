import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ message, type = 'success', onClose }) {
  if (!message) return null;

  const styles = {
    success: 'bg-emerald-900/90 text-white border-emerald-700',
    error: 'bg-rose-900/90 text-white border-rose-700',
    info: 'bg-indigo-900/90 text-white border-indigo-700'
  };

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-indigo-400 shrink-0" />
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md max-w-md ${styles[type] || styles.success}`}>
        {icons[type] || icons.success}
        <p className="text-sm font-medium leading-snug">{message}</p>
        {onClose && (
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded transition-colors ml-2">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
