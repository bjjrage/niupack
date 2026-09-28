'use client';

import { FormEvent, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/auth/supabase-browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')) {
      setMessage('Supabase Auth no está configurado en este entorno.');
      setLoading(false);
      return;
    }
    const client = createSupabaseBrowserClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    else window.location.href = new URLSearchParams(window.location.search).get('next') || '/logistics';
    setLoading(false);
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-6">
      <div><p className="text-xs uppercase tracking-[0.2em] text-red-400">NIU Intelligence OS</p><h1 className="mt-2 text-2xl font-semibold">Acceso interno</h1><p className="mt-2 text-sm text-slate-400">Iniciá sesión para acceder a Logística.</p></div>
      <label className="block text-sm">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2" /></label>
      <label className="block text-sm">Contraseña<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2" /></label>
      <button disabled={loading} className="w-full rounded bg-red-500 p-2 font-semibold disabled:opacity-50">{loading ? 'Ingresando…' : 'Ingresar'}</button>
      {message && <p role="alert" className="text-sm text-red-300">{message}</p>}
    </form>
  </main>;
}
