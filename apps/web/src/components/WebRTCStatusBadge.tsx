import type { WebRTCConnectionState } from "../hooks/useWebRTC";

type WebRTCStatusBadgeProps = {
  state: WebRTCConnectionState;
};

const labels: Record<WebRTCConnectionState, string> = {
  idle: "Peer idle",
  connecting: "Peer connecting",
  connected: "Peer connected",
  failed: "Peer failed"
};

const colors: Record<WebRTCConnectionState, string> = {
  idle: "bg-cream",
  connecting: "bg-sky",
  connected: "bg-sun",
  failed: "bg-coral"
};

export function WebRTCStatusBadge({ state }: WebRTCStatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border-2 border-ink px-3 py-1 text-xs font-extrabold text-ink ${colors[state]}`}>
      {labels[state]}
    </span>
  );
}
