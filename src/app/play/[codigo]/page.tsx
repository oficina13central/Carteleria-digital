import { SignagePlayer } from '@/components/player/SignagePlayer';

export const dynamic = 'force-dynamic';

export default async function PlayCodePage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  return <SignagePlayer codigo={codigo} />;
}
