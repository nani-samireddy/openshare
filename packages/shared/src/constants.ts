export const ROOM_ID_LENGTH = 6;
export const ROOM_ID_MIN_LENGTH = 6;
export const ROOM_ID_MAX_LENGTH = 16;
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{6,16}$/;

export const ROOM_STATES = {
  WAITING_FOR_HOST: "waiting_for_host",
  HOST_SHARING: "host_sharing",
  HOST_STOPPED: "host_stopped",
  HOST_DISCONNECTED: "host_disconnected"
} as const;

export const ROOM_ACCESS_MODES = {
  APPROVAL: "approval",
  OPEN: "open"
} as const;

export const SOCKET_EVENTS = {
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  ROOM_STATE: "room:state",
  ROOM_ACCESS_MODE: "room:access-mode",
  VIEWER_REQUESTED: "viewer:requested",
  VIEWER_APPROVAL: "viewer:approval",
  VIEWER_APPROVAL_BULK: "viewer:approval-bulk",
  VIEWER_APPROVED: "viewer:approved",
  VIEWER_DENIED: "viewer:denied",
  HOST_STARTED_SHARING: "host:started-sharing",
  HOST_STOPPED_SHARING: "host:stopped-sharing",
  VIEWER_JOINED: "viewer:joined",
  VIEWER_LEFT: "viewer:left",
  WEBRTC_OFFER: "webrtc:offer",
  WEBRTC_ANSWER: "webrtc:answer",
  WEBRTC_ICE_CANDIDATE: "webrtc:ice-candidate"
} as const;

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" }
];

export const DEFAULT_SIGNALING_URL = "http://localhost:4000";
export const DEFAULT_CLIENT_ORIGIN = "http://localhost:5173";
export const DEFAULT_ROOM_TTL_MINUTES = 30;

export function isValidRoomId(roomId: string): boolean {
  return ROOM_ID_PATTERN.test(roomId);
}
