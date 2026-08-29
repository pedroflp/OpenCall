import ChannelPage from '@/flows/channel'

export default async function Channel({ params }: { params: { channelId: string } }) {
  return <ChannelPage channelId={params.channelId} />
}
