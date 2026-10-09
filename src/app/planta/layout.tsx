import React from 'react';

export const metadata = {
  title: 'Control de Empaque | NIUPACK Planta',
  description: 'Control de dotación y cronómetro operativo de empaque de planta NIUPACK',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
};

export default function PlantaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0a0d12] text-slate-100 antialiased font-sans flex flex-col justify-between selection:bg-brand-500 selection:text-white">
      <main className="flex-1 flex flex-col items-center justify-start w-full max-w-md mx-auto p-4 sm:p-6">
        {children}
      </main>
      <footer className="w-full text-center py-4 text-[11px] text-slate-600 font-mono tracking-wider">
        NIUPACK OS · PLANTA OPERATIVA
      </footer>
    </div>
  );
}
