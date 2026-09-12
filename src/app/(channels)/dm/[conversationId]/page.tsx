import DirectConversationPage from '@/flows/channel/dm';

export default async function DirectMessage({ params }: { params: { conversationId: string } }) {
  return <DirectConversationPage conversationId={params.conversationId} />;
}
