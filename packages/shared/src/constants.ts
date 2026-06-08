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

export const ANNOTATION_COLORS = ["#F9BD18", "#F26F5B", "#4698CC", "#F5EFDF", "#26304F"] as const;
export const ANNOTATION_FADE_MS = 5000;
export const ANNOTATION_MAX_POINTS_PER_SEGMENT = 64;
export const DEFAULT_VIEWER_LIMIT = 20;
export const MAX_VIEWER_LIMIT = 100;
export const MIN_ROOM_PASSWORD_LENGTH = 4;
export const MAX_ROOM_PASSWORD_LENGTH = 64;
export const MAX_CHAT_MESSAGE_LENGTH = 500;
export const REACTION_TYPES = ["clap", "heart", "thumbs_up", "celebrate"] as const;

export const SOCKET_EVENTS = {
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  ROOM_STATE: "room:state",
  ROOM_ACCESS_MODE: "room:access-mode",
  ROOM_SECURITY: "room:security",
  ROOM_INTERACTION_SETTINGS: "room:interaction-settings",
  VIEWER_REQUESTED: "viewer:requested",
  VIEWER_APPROVAL: "viewer:approval",
  VIEWER_APPROVAL_BULK: "viewer:approval-bulk",
  VIEWER_APPROVED: "viewer:approved",
  VIEWER_DENIED: "viewer:denied",
  VIEWER_KICK: "viewer:kick",
  VIEWER_KICKED: "viewer:kicked",
  VIEWER_RAISE_HAND: "viewer:raise-hand",
  VIEWER_LOWER_HAND: "viewer:lower-hand",
  PRESENTER_INVITE: "presenter:invite",
  PRESENTER_INVITED: "presenter:invited",
  PRESENTER_RESPONSE: "presenter:response",
  PRESENTER_CHANGED: "presenter:changed",
  PRESENTER_RECLAIM: "presenter:reclaim",
  PRESENTER_STARTED_SHARING: "presenter:started-sharing",
  PRESENTER_STOPPED_SHARING: "presenter:stopped-sharing",
  CHAT_SEND: "chat:send",
  CHAT_MESSAGE: "chat:message",
  REACTION_SEND: "reaction:send",
  REACTION_RECEIVED: "reaction:received",
  ANNOTATION_STROKE: "annotation:stroke",
  ANNOTATION_CLEAR: "annotation:clear",
  ANNOTATION_VIEWER_DRAWING: "annotation:viewer-drawing",
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
