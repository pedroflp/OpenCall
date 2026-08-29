import type { TrackPublishOptions, VideoCaptureOptions } from 'livekit-client';

// Câmera não tem a variância de conteúdo que justifica presets configuráveis
// de screen share (streamQuality.ts) — sempre um rosto em movimento moderado.
// Valor fixo, sem simulcast, mesma filosofia já validada em produção pro
// screen share (ver docs/rfc-camera.md D2).
export const CAMERA_CAPTURE_OPTIONS: VideoCaptureOptions = {
  resolution: { width: 1280, height: 720, frameRate: 24 },
};

export const CAMERA_PUBLISH_OPTIONS: TrackPublishOptions = {
  videoEncoding: { maxBitrate: 1_200_000, maxFramerate: 24 },
  simulcast: false,
};

// `{ exact }`, não o id solto — mesma razão de audioDeviceConstraint
// (noiseSuppression.ts): solto vira constraint "ideal", que o navegador pode
// ignorar e devolver outro dispositivo no lugar do escolhido.
export function videoDeviceConstraint(deviceId: string | undefined): ConstrainDOMString | undefined {
  return deviceId ? { exact: deviceId } : undefined;
}
