'use client';

import React from 'react';
import Link from 'next/link';

export interface VisibilityStepperProps {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

const STEPS = [
  { step: 1, label: 'GENERAR', href: '/visibility/generator', hint: 'Generador de Consultas' },
  { step: 2, label: 'REVISAR', href: '/visibility/generator', hint: 'Filtrar & Modificar' },
  { step: 3, label: 'CONGELAR', href: '/visibility/batteries', hint: 'Guardar Batería Fija' },
  { step: 4, label: 'EJECUTAR', href: '/visibility/batteries', hint: 'Lanzar Run D1/D15' },
  { step: 5, label: 'AUDITAR', href: '/visibility/runs', hint: 'Resultados & Métricas' },
  { step: 6, label: 'ACTUAR', href: '/actions', hint: 'Plan de Mejora' },
  { step: 7, label: 'RE-MEDIR', href: '/visibility/batteries', hint: 'Comparar D1 vs D15' },
];

export const VisibilityStepper: React.FC<VisibilityStepperProps> = ({ currentStep }) => {
  return (
    <div className="w-full bg-[#11161d] border border-gray-800 rounded-lg p-3 mb-6 shadow-sm overflow-x-auto">
      <div className="flex items-center justify-between min-w-[720px] text-xs font-mono">
        {STEPS.map((item, index) => {
          const isActive = item.step === currentStep;
          const isDone = item.step < currentStep;

          return (
            <React.Fragment key={item.step}>
              <Link
                href={item.href}
                className={`flex items-center space-x-2 px-2.5 py-1.5 rounded transition-colors ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold'
                    : isDone
                    ? 'text-emerald-400 hover:text-emerald-300'
                    : 'text-gray-500 hover:text-gray-400'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive
                      ? 'bg-amber-500 text-black'
                      : isDone
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-gray-900 text-gray-500 border border-gray-800'
                  }`}
                >
                  {isDone ? '✓' : item.step}
                </span>
                <div className="flex flex-col">
                  <span className="tracking-wider">{item.label}</span>
                  <span className="text-[9px] opacity-70 font-sans">{item.hint}</span>
                </div>
              </Link>

              {index < STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-2 ${
                    isDone ? 'bg-emerald-800/50' : 'bg-gray-800'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
