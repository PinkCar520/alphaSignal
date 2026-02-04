import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  action?: React.ReactNode;
}

export function Card({ className = '', title, action, children, ...props }: CardProps) {
  const baseClasses = "bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200 transition-all duration-300 hover:shadow-md";
  const combinedClasses = `${baseClasses} ${className}`.trim();

  return (
    <div
      className={combinedClasses}
      {...props}
    >
      {(title || action) && (
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          {title && <h3 className="font-semibold text-slate-800 tracking-tight">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}
