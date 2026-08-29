import { VoiceChannelStageSkeleton } from '@/components/VoiceDock/VoiceChannelStageSkeleton';

/**
 * Trocar de canal re-renderiza só este segmento (a sidebar e a lista de
 * usuários vivem no layout e ficam de pé), mas a página ainda espera o usuário
 * vir do banco. Sem este boundary a navegação não pintava nada nesse intervalo
 * — a UI parecia travada em vez de carregando.
 */
export default function ChannelLoading() {
  return <VoiceChannelStageSkeleton />;
}
