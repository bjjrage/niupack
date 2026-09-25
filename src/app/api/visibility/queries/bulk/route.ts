import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';

export async function POST(req: Request) {
  try {
    const { action } = await req.json();
    const queries = await repository.getQueries();

    if (action === 'APPROVE_ALL') {
      for (const q of queries) {
        if (q.status === 'PROPOSED') {
          await repository.updateQuery(q.id, { status: 'APPROVED' });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
