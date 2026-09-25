'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Mail, RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert, ArrowRight, ExternalLink, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { GmailIntegrationStatus } from '@/lib/gmail/gmail-client';

export default function InboxPage() {
  const [status, setStatus] = useState<GmailIntegrationStatus>('BLOCKED_EXTERNAL_CREDENTIAL');
  const [message, setMessage] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/rfq/inbox')
      .then((res) => res.json())
      .then((data) => {
        if (data.status) {
          setStatus(data.status.status);
          setMessage(data.status.message);
          setUserEmail(data.status.userEmail);
        }
      })
      .catch(console.error);
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await fetch('/api/rfq/inbox/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSyncFeedback(
          `Sincronización completada. Se detectaron ${data.newRepliesCount} respuestas de cotización y se extrajeron las condiciones comerciales.`
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 4</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Email Agent</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Bandeja Gmail Corporativa & Detección de Respuestas
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Sincronización de hilos RFQ, lectura de propuestas adjuntas y extracción de términos comerciales.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" isLoading={isSyncing} onClick={handleSync}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Sincronizar Bandeja
          </Button>
          <Link href="/rfq/quotes">
            <Button variant="secondary" size="sm">
              Ver Cotizaciones Extraídas
            </Button>
          </Link>
        </div>
      </div>

      {syncFeedback && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-300 flex items-center justify-between">
          <span>{syncFeedback}</span>
          <button onClick={() => setSyncFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Integration Status Banner */}
      <div
        className={`p-4 rounded border ${
          status === 'CONNECTED'
            ? 'bg-emerald-950/30 border-emerald-800/60'
            : 'bg-amber-950/30 border-amber-800/60'
        } flex items-start gap-3`}
      >
        {status === 'CONNECTED' ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">
              Estado de Integración Gmail API:
            </span>
            <Badge variant={status === 'CONNECTED' ? 'success' : 'warning'} size="sm">
              {status}
            </Badge>
          </div>
          <p className="text-slate-300 leading-relaxed">{message}</p>
          {status === 'BLOCKED_EXTERNAL_CREDENTIAL' && (
            <div className="pt-2 text-[11px] text-slate-400 font-mono">
              Configura en <code>.env.local</code>: <code>GMAIL_CLIENT_ID</code>, <code>GMAIL_CLIENT_SECRET</code>, <code>GMAIL_REFRESH_TOKEN</code>.
            </div>
          )}
        </div>
      </div>

      {/* Thread list with mock / synced items */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-white tracking-tight">Hilos de Conversación RFQ</h3>

        <div className="space-y-3">
          <div className="bg-[#141820] border border-slate-800 rounded p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                <span className="font-semibold text-white text-xs">Copobras S.A. (vendas@copobras.com.br)</span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">10 Sep 2026, 14:32</span>
            </div>
            <h4 className="text-xs font-medium text-slate-200">Re: Solicitud de Cotización Formal (RFQ-2026-001) - Copobras</h4>
            <p className="text-xs text-slate-400 line-clamp-2">
              Prezado cliente, Agradecemos a consulta de preços para copos descartáveis de papel 12 oz. Segue nossa proposta comercial: 300.000 unidades a R$ 0,275/u (USD 0.0495) FOB São Paulo...
            </p>
            <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-800">
              <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                <Paperclip className="h-3 w-3" /> Proposta_Copobras_300k.pdf
              </span>
              <Link href="/rfq/quotes" className="text-brand-400 hover:underline inline-flex items-center gap-1 font-medium">
                Inspeccionar cotización extraída <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <div className="bg-[#141820] border border-slate-800 rounded p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                <span className="font-semibold text-white text-xs">Pack Solutions Argentina (ventas@packsolutions.com.ar)</span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">15 Sep 2026, 10:15</span>
            </div>
            <h4 className="text-xs font-medium text-slate-200">Re: Solicitud de Cotización Formal (RFQ-2026-001) - Pack Solutions</h4>
            <p className="text-xs text-slate-400 line-clamp-2">
              Estimados, adjuntamos cotización para vaso 12 oz polipapel con entrega en Buenos Aires: 150.000 unidades a USD 0.0588 DDP Buenos Aires...
            </p>
            <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-800">
              <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                <Paperclip className="h-3 w-3" /> Cotizacion_PS_12oz.pdf
              </span>
              <Link href="/rfq/quotes" className="text-brand-400 hover:underline inline-flex items-center gap-1 font-medium">
                Inspeccionar cotización extraída <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
