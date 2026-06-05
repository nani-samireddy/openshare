import type { ROOM_STATES } from "./constants.js";

export type RoomRole = "host" | "viewer";
export type RoomState = (typeof ROOM_STATES)[keyof typeof ROOM_STATES];

export type RoomJoinPayload = {
  roomId: string;
  role: RoomRole;
};

export type RoomStatePayload = {
  roomId: string;
  state: RoomState;
  viewerCount: number;
  isHostPresent: boolean;
  isSharing: boolean;
  selfId?: string;
};

export type ViewerJoinedPayload = {
  roomId: string;
  viewerId: string;
};

export type ViewerLeftPayload = {
  roomId: string;
  viewerId: string;
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
};

export type HealthResponse = {
  status: "ok";
};

export type PublicConfigResponse = {
  iceServers: RTCIceServer[];
};
