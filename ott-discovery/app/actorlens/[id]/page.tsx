import ActorLensClient from '../ActorLensClient';

export default async function ActorLensProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ActorLensClient actorId={id} />;
}
