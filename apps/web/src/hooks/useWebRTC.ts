import { useCallback, useEffect, useRef } from "react";
import {
  SOCKET_EVENTS,
  type ClientIceCandidatePayload,
  type RoomRole,
  type ServerAnswerPayload,
  type ServerIceCandidatePayload,
  type ServerOfferPayload,
  type ViewerJoinedPayload,
  type ViewerLeftPayload
} from "@openshare/shared";
import type { Socket } from "socket.io-client";

type UseWebRTCOptions = {
  socket: Socket;
  roomId: string;
  role: RoomRole;
  iceServers: RTCIceServer[];
  localStream: MediaStream | null;
  onConnectionState: (state: WebRTCConnectionState) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
};

export type WebRTCConnectionState = "idle" | "connecting" | "connected" | "failed";

export function useWebRTC({ socket, roomId, role, iceServers, localStream, onConnectionState, onRemoteStream }: UseWebRTCOptions) {
  const hostPeersRef = useRef(new Map<string, RTCPeerConnection>());
  const viewerPeerRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const updateHostConnectionState = useCallback(() => {
    const peers = Array.from(hostPeersRef.current.values());
    if (peers.length === 0) {
      onConnectionState(localStream ? "idle" : "idle");
      return;
    }

    if (peers.some((peer) => peer.connectionState === "connected")) {
      onConnectionState("connected");
      return;
    }

    if (peers.some((peer) => peer.connectionState === "failed" || peer.connectionState === "disconnected")) {
      onConnectionState("failed");
      return;
    }

    onConnectionState("connecting");
  }, [localStream, onConnectionState]);

  const closeHostPeer = useCallback((viewerId: string) => {
    hostPeersRef.current.get(viewerId)?.close();
    hostPeersRef.current.delete(viewerId);
    updateHostConnectionState();
  }, [updateHostConnectionState]);

  const closeAll = useCallback(() => {
    for (const peer of hostPeersRef.current.values()) {
      peer.close();
    }
    hostPeersRef.current.clear();
    viewerPeerRef.current?.close();
    viewerPeerRef.current = null;
    remoteStreamRef.current = null;
    onConnectionState("idle");
    onRemoteStream(null);
  }, [onConnectionState, onRemoteStream]);

  const createHostOffer = useCallback(
    async (viewerId: string) => {
      if (!localStream) {
        return;
      }

      closeHostPeer(viewerId);
      const peer = new RTCPeerConnection({ iceServers });
      hostPeersRef.current.set(viewerId, peer);
      onConnectionState("connecting");

      for (const track of localStream.getTracks()) {
        peer.addTrack(track, localStream);
      }

      peer.onconnectionstatechange = updateHostConnectionState;

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
            roomId,
            targetId: viewerId,
            candidate: event.candidate.toJSON()
          } satisfies ClientIceCandidatePayload);
        }
      };

      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit(SOCKET_EVENTS.WEBRTC_OFFER, { roomId, viewerId, sdp: offer });
      } catch {
        onConnectionState("failed");
      }
    },
    [closeHostPeer, iceServers, localStream, onConnectionState, roomId, socket, updateHostConnectionState]
  );

  useEffect(() => {
    if (role !== "host") {
      return;
    }

    function handleViewerJoined(payload: ViewerJoinedPayload) {
      if (payload.roomId === roomId) {
        void createHostOffer(payload.viewerId);
      }
    }

    function handleViewerLeft(payload: ViewerLeftPayload) {
      if (payload.roomId === roomId) {
        closeHostPeer(payload.viewerId);
      }
    }

    async function handleAnswer(payload: ServerAnswerPayload) {
      if (payload.roomId !== roomId) {
        return;
      }

      const peer = hostPeersRef.current.get(payload.viewerId);
      if (peer) {
        try {
          await peer.setRemoteDescription(payload.sdp);
        } catch {
          onConnectionState("failed");
        }
      }
    }

    async function handleIce(payload: ServerIceCandidatePayload) {
      if (payload.roomId !== roomId || payload.fromId === "host") {
        return;
      }

      const peer = hostPeersRef.current.get(payload.fromId);
      if (peer) {
        try {
          await peer.addIceCandidate(payload.candidate);
        } catch {
          onConnectionState("failed");
        }
      }
    }

    socket.on(SOCKET_EVENTS.VIEWER_JOINED, handleViewerJoined);
    socket.on(SOCKET_EVENTS.VIEWER_LEFT, handleViewerLeft);
    socket.on(SOCKET_EVENTS.WEBRTC_ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, handleIce);

    return () => {
      socket.off(SOCKET_EVENTS.VIEWER_JOINED, handleViewerJoined);
      socket.off(SOCKET_EVENTS.VIEWER_LEFT, handleViewerLeft);
      socket.off(SOCKET_EVENTS.WEBRTC_ANSWER, handleAnswer);
      socket.off(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, handleIce);
    };
  }, [closeHostPeer, createHostOffer, onConnectionState, role, roomId, socket]);

  useEffect(() => {
    if (role === "host" && !localStream) {
      closeAll();
    }
  }, [closeAll, localStream, role]);

  useEffect(() => {
    if (role !== "viewer") {
      return;
    }

    async function handleOffer(payload: ServerOfferPayload) {
      if (payload.roomId !== roomId) {
        return;
      }

      viewerPeerRef.current?.close();
      remoteStreamRef.current = new MediaStream();
      onConnectionState("connecting");
      onRemoteStream(remoteStreamRef.current);

      const peer = new RTCPeerConnection({ iceServers });
      viewerPeerRef.current = peer;

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          onConnectionState("connected");
        } else if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          onConnectionState("failed");
        } else if (peer.connectionState === "connecting") {
          onConnectionState("connecting");
        }
      };

      peer.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) {
          onRemoteStream(stream);
          return;
        }

        if (remoteStreamRef.current) {
          remoteStreamRef.current.addTrack(event.track);
          onRemoteStream(remoteStreamRef.current);
        }
      };

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
            roomId,
            targetId: "host",
            candidate: event.candidate.toJSON()
          } satisfies ClientIceCandidatePayload);
        }
      };

      try {
        await peer.setRemoteDescription(payload.sdp);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit(SOCKET_EVENTS.WEBRTC_ANSWER, { roomId, sdp: answer });
      } catch {
        onConnectionState("failed");
      }
    }

    async function handleIce(payload: ServerIceCandidatePayload) {
      if (payload.roomId === roomId && payload.fromId === "host" && viewerPeerRef.current) {
        try {
          await viewerPeerRef.current.addIceCandidate(payload.candidate);
        } catch {
          onConnectionState("failed");
        }
      }
    }

    function handleHostStopped() {
      closeAll();
    }

    socket.on(SOCKET_EVENTS.WEBRTC_OFFER, handleOffer);
    socket.on(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, handleIce);
    socket.on(SOCKET_EVENTS.HOST_STOPPED_SHARING, handleHostStopped);

    return () => {
      socket.off(SOCKET_EVENTS.WEBRTC_OFFER, handleOffer);
      socket.off(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, handleIce);
      socket.off(SOCKET_EVENTS.HOST_STOPPED_SHARING, handleHostStopped);
      closeAll();
    };
  }, [closeAll, iceServers, onConnectionState, onRemoteStream, role, roomId, socket]);

  useEffect(() => closeAll, [closeAll]);
}
