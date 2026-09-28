import { redirect } from 'next/navigation';
import { requireLogisticsIdentity } from '@/lib/auth/logistics-auth';

export const dynamic = 'force-dynamic';

export default async function LogisticsLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireLogisticsIdentity();
  } catch {
    redirect('/login?next=/logistics');
  }
  return children;
}
