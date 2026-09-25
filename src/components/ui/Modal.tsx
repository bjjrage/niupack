'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}) => {
  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div
        className={`w-full ${maxWidthClasses[maxWidth]} bg-[#141820] border border-slate-700 rounded shadow-2xl flex flex-col max-h-[90vh]`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight">{title}</h3>
            {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto text-xs text-slate-300 space-y-4">{children}</div>

        {/* Footer */}
        {footer && <div className="p-3.5 border-t border-slate-800 flex justify-end gap-2 bg-[#10141b] rounded-b">{footer}</div>}
      </div>
    </div>
  );
};
