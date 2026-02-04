import React from 'react';

interface BadgeProps {
  variant?: 'neutral' | 'bullish' | 'bearish' | 'gold' | 'outline';
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  const variants = {
    neutral: "bg-slate-100 text-slate-600 border-slate-200",
    bullish: "bg-rose-50 text-rose-700 border-rose-200 shadow-sm", // A-share Red for Up
    bearish: "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm", // A-share Green for Down
    gold: "bg-yellow-50 text-yellow-700 border-yellow-200",
    outline: "bg-transparent",
  };

  const baseClasses = "px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border";
  const combinedClasses = `${baseClasses} ${variants[variant]} ${className}`.trim();

  return (
    <span className={combinedClasses}>
      {children}
    </span>
  );
}
