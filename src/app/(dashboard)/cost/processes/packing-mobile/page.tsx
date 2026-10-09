'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PackingMobileRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Preserve query parameters (such as token or line) and redirect to /planta/empaque
    const query = typeof window !== 'undefined' ? window.location.search : '';
    router.replace(`/planta/empaque${query}`);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0a0d12] flex items-center justify-center text-slate-400 text-sm">
      Redirigiendo a pantalla móvil de planta…
    </div>
  );
}
