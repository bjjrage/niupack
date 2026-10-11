import { RfqWorkspace } from '@/components/print-rfq/RfqWorkspace';

export default async function SolicitudPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-7xl">
      <RfqWorkspace id={id} />
    </div>
  );
}
