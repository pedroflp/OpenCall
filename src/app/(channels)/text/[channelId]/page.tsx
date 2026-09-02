import TextChannelPage from '@/flows/channel/text'

export default async function ChannelTextWithId({ params }: { params: { channelId: string } }) {
  return <TextChannelPage channelId={params.channelId} />
}
