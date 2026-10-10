'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { api, errorText } from '@/components/rfq/types';
import type { GmailIntegrationStatus } from '@/lib/gmail/gmail-client';

interface Status { status: GmailIntegrationStatus; message: string; userEmail: string }

/** Estado real de la integración con Gmail. No muestra correos de ejemplo: si no hay lectura automática, lo dice. */
export default function GmailInboxPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const result = await api<{ status: Status }>('/api/rfq/inbox');
      if (!result.ok) setError(errorText(result));
      else setStatus(result.data.status);
    })();
  }, []);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Inbox className="h-5 w-5 text-brand-500" />Bandeja Gmail</h1>
        <p className="text-xs text-slate-400 mt-0.5">Lectura de respuestas de proveedores desde el Gmail corporativo.</p>
      </div>
      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}
      {status && (
        <section className="rounded border border-slate-800 bg-[#141820] p-4 space-y-3">
          <div className="flex items-center gap-2"><Badge variant={status.status === 'CONNECTED' ? 'warning' : 'neutral'}>{status.status === 'CONNECTED' ? 'Credenciales presentes' : 'Gmail no conectado'}</Badge></div>
          <p className="text-xs text-slate-300">{status.message}</p>
          <p className="text-xs text-slate-400">La sincronización automática de la bandeja no está habilitada: no se muestran correos ni se leen respuestas. Para registrar una oferta recibida por correo, abrí la RFQ y usá <strong>Ofertas → Subir PDF</strong> o <strong>Carga manual</strong>; o pedile al proveedor que use su enlace personal.</p>
          <Link href="/rfq/rfqs" className="text-xs text-brand-400 hover:underline">Ir a las RFQ</Link>
        </section>
      )}
    </div>
  );
}
