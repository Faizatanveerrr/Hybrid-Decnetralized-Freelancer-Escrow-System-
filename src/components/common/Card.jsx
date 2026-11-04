import React from 'react';

export default function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_-4px_rgba(30,27,75,0.06)] p-6 transition-all duration-200 ${
        hover ? 'hover:shadow-[0_8px_24px_-4px_rgba(79,70,229,0.12)] hover:border-indigo-100' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
