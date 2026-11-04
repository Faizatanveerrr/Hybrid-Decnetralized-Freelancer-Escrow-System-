import React from 'react';

export default function Loading({ message = 'Loading data...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="relative w-12 h-12">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
        </div>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{message}</p>
    </div>
  );
}
