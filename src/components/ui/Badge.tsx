import React from 'react';

export interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'brand';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  children,
  className = '',
}) => {
  const baseStyles = 'inline-flex items-center font-medium rounded border';

  const variants = {
    success: 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60',
    warning: 'bg-amber-950/40 text-amber-400 border-amber-800/60',
    danger: 'bg-red-950/40 text-red-400 border-red-800/60',
    neutral: 'bg-slate-800/60 text-slate-300 border-slate-700/60',
    brand: 'bg-brand-950/60 text-brand-300 border-brand-800/70',
  };

  const sizes = {
    sm: 'text-[11px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
  };

  return <span className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}>{children}</span>;
};
