import type { ANNOTATION_COLORS, ROOM_ACCESS_MODES, ROOM_STATES } from "./constants.js";

export type RoomRole = "host" | "viewer";
export type RoomState = (typeof ROOM_STATES)[keyof typeof ROOM_STATES];
export type RoomAccessMode = (typeof ROOM_ACCESS_MODES)[keyof typeof ROOM_ACCESS_MODES];
export type AnnotationColor = (typeof ANNOTATION_COLORS)[number];

export type AnnotationPoint = {
  x: number;
  y: number;
};

export type AnnotationStrokePayload = {
  roomId: string;
  strokeId: string;
  color: AnnotationColor;
  points: AnnotationPoint[];
  complete: boolean;
};

export type AnnotationClearPayload = {
  roomId: string;
};

export type AnnotationViewerDrawingPayload = {
  roomId: string;
  enabled: boolean;
};

export type RoomJoinPayload = {
  roomId: string;
  role: RoomRole;
  displayName?: string;
  password?: string;
  hostToken?: string;
};

export type RoomJoinAck = {
  ok: boolean;
  error?: string;
  status?: "joined" | "pending";
};

export type RoomStatePayload = {
  roomId: string;
  state: RoomState;
  accessMode: RoomAccessMode;
  viewerDrawingEnabled: boolean;
  locked: boolean;
  hasPassword: boolean;
  viewerLimit: number;
  persistent: boolean;
  viewerCount: number;
  viewers: RoomViewer[];
  isHostPresent: boolean;
  isSharing: boolean;
  selfId?: string;
};

export type RoomViewer = {
  viewerId: string;
  displayName: string;
};

export type ViewerJoinedPayload = {
  roomId: string;
  viewerId: string;
  displayName: string;
};

export type ViewerLeftPayload = {
  roomId: string;
  viewerId: string;
  displayName?: string;
};

export type ViewerRequestedPayload = {
  roomId: string;
  requestId: string;
  displayName: string;
};

export type ViewerApprovalPayload = {
  roomId: string;
  requestId: string;
  approved: boolean;
};

export type ViewerApprovalBulkPayload = {
  roomId: string;
  action: "approve" | "deny";
};

export type RoomAccessModePayload = {
  roomId: string;
  accessMode: RoomAccessMode;
};

export type RoomSecurityPayload = {
  roomId: string;
  locked?: boolean;
  viewerLimit?: number;
  password?: string;
  clearPassword?: boolean;
  persistent?: boolean;
};

export type ViewerApprovedPayload = {
  roomId: string;
  viewerId: string;
};

export type ViewerDeniedPayload = {
  roomId: string;
  reason: string;
};

export type ViewerKickPayload = {
  roomId: string;
  viewerId: string;
};

export type ViewerKickedPayload = {
  roomId: string;
  reason: string;
};

export type ClientOfferPayload = {
  roomId: string;
  viewerId: string;
  sdp: RTCSessionDescriptionInit;
};

export type ServerOfferPayload = ClientOfferPayload;

export type ClientAnswerPayload = {
  roomId: string;
  sdp: RTCSessionDescriptionInit;
};

export type ServerAnswerPayload = ClientAnswerPayload & {
  viewerId: string;
};

export type ClientIceCandidatePayload = {
  roomId: string;
  targetId?: string;
  candidate: RTCIceCandidateInit;
};

export type ServerIceCandidatePayload = {
  roomId: string;
  fromId: string;
  candidate: RTCIceCandidateInit;
};

export type CreateRoomResponse = {
  roomId: string;
  accessMode: RoomAccessMode;
  hostToken: string;
};

export type CreateRoomRequest = {
  accessMode?: RoomAccessMode;
  password?: string;
  locked?: boolean;
  viewerLimit?: number;
  persistent?: boolean;
};

export type HealthResponse = {
  status: "ok";
};

export type PublicConfigResponse = {
  iceServers: RTCIceServer[];
};
