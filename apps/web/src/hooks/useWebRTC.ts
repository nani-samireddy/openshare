import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  SOCKET_EVENTS,
  type ClientIceCandidatePayload,
  type PresenterId,
  type RoomRole,
  type RoomViewer,
  type ServerAnswerPayload,
  type ServerIceCandidatePayload,
  type ServerOfferPayload,
  type ViewerLeftPayload
} from "@openshare/shared";
import type { Socket } from "socket.io-client";

type UseWebRTCOptions = {
  socket: Socket;
  roomId: string;
  role: RoomRole;
  selfId?: string;
  presenterId: PresenterId;
  viewers: RoomViewer[];
  iceServers: RTCIceServer[];
  localStream: MediaStream | null;
  onConnectionState: (state: WebRTCConnectionState) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
};

export type WebRTCConnectionState = "idle" | "connecting" | "connected" | "failed";

export function useWebRTC({
  socket,
  roomId,
  role,
  selfId,
  presenterId,
  viewers,
  iceServers,
  localStream,
  onConnectionState,
  onRemoteStream
}: UseWebRTCOptions) {
  const outgoingPeersRef = useRef(new Map<PresenterId, RTCPeerConnection>());
  const receiverPeerRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const selfParticipantId: PresenterId | undefined = role === "host" ? "host" : selfId;
  const isPresenter = Boolean(selfParticipantId && selfParticipantId === presenterId);
  const audienceIds = useMemo<PresenterId[]>(() => {
    if (!isPresenter || !selfParticipantId) {
      return [];
    }

    const targets: PresenterId[] = selfParticipantId === "host" ? [] : ["host"];
    for (const viewer of viewers) {
      if (viewer.viewerId !== selfParticipantId) {
        targets.push(viewer.viewerId);
      }
    }
    return targets;
  }, [isPresenter, selfParticipantId, viewers]);
  const audienceKey = audienceIds.join("|");

  const updatePresenterConnectionState = useCallback(() => {
    const peers = Array.from(outgoingPeersRef.current.values());
    if (peers.length === 0) {
      onConnectionState("idle");
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
  }, [onConnectionState]);

  const closeOutgoingPeer = useCallback(
    (targetId: PresenterId) => {
      outgoingPeersRef.current.get(targetId)?.close();
      outgoingPeersRef.current.delete(targetId);
      updatePresenterConnectionState();
    },
    [updatePresenterConnectionState]
  );

  const closeOutgoing = useCallback(() => {
    for (const peer of outgoingPeersRef.current.values()) {
      peer.close();
    }
    outgoingPeersRef.current.clear();
    updatePresenterConnectionState();
  }, [updatePresenterConnectionState]);

  const closeReceiver = useCallback(() => {
    const hadReceiver = Boolean(receiverPeerRef.current || remoteStreamRef.current);
    receiverPeerRef.current?.close();
    receiverPeerRef.current = null;
    remoteStreamRef.current = null;
    if (hadReceiver) {
      onRemoteStream(null);
      onConnectionState("idle");
    }
  }, [onConnectionState, onRemoteStream]);

  const closeAll = useCallback(() => {
    closeOutgoing();
    closeReceiver();
  }, [closeOutgoing, closeReceiver]);

  const createPresenterOffer = useCallback(
    async (targetId: PresenterId) => {
      if (!localStream) {
        return;
      }

      closeOutgoingPeer(targetId);
      const peer = new RTCPeerConnection({ iceServers });
      outgoingPeersRef.current.set(targetId, peer);
      onConnectionState("connecting");

      for (const track of localStream.getTracks()) {
        peer.addTrack(track, localStream);
      }

      peer.onconnectionstatechange = updatePresenterConnectionState;
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
            roomId,
            targetId,
            candidate: event.candidate.toJSON()
          } satisfies ClientIceCandidatePayload);
        }
      };

      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit(SOCKET_EVENTS.WEBRTC_OFFER, { roomId, targetId, sdp: offer });
      } catch {
        onConnectionState("failed");
      }
    },
    [closeOutgoingPeer, iceServers, localStream, onConnectionState, roomId, socket, updatePresenterConnectionState]
  );

  useEffect(() => {
    if (!isPresenter) {
      closeOutgoing();
      return;
    }

    closeReceiver();

    if (!localStream) {
      closeOutgoing();
      return;
    }

    const currentTargets = new Set(audienceIds);
    for (const targetId of outgoingPeersRef.current.keys()) {
      if (!currentTargets.has(targetId)) {
        closeOutgoingPeer(targetId);
      }
    }

    for (const targetId of audienceIds) {
      if (!outgoingPeersRef.current.has(targetId)) {
        void createPresenterOffer(targetId);
      }
    }
  }, [audienceKey, audienceIds, closeOutgoing, closeOutgoingPeer, closeReceiver, createPresenterOffer, isPresenter, localStream]);

  useEffect(() => {
    function handleParticipantLeft(payload: ViewerLeftPayload) {
      if (payload.roomId === roomId) {
        closeOutgoingPeer(payload.viewerId);
      }
    }

    async function handleAnswer(payload: ServerAnswerPayload) {
      if (payload.roomId !== roomId) {
        return;
      }

      const peer = outgoingPeersRef.current.get(payload.fromId);
      if (peer) {
        try {
          await peer.setRemoteDescription(payload.sdp);
        } catch {
          onConnectionState("failed");
        }
      }
    }

    async function handleIce(payload: ServerIceCandidatePayload) {
      if (payload.roomId !== roomId) {
        return;
      }

      const peer = outgoingPeersRef.current.get(payload.fromId);
      if (peer) {
        try {
          await peer.addIceCandidate(payload.candidate);
        } catch {
          onConnectionState("failed");
        }
      }
    }

    socket.on(SOCKET_EVENTS.VIEWER_LEFT, handleParticipantLeft);
    socket.on(SOCKET_EVENTS.WEBRTC_ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, handleIce);

    return () => {
      socket.off(SOCKET_EVENTS.VIEWER_LEFT, handleParticipantLeft);
      socket.off(SOCKET_EVENTS.WEBRTC_ANSWER, handleAnswer);
      socket.off(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, handleIce);
    };
  }, [closeOutgoingPeer, onConnectionState, roomId, socket]);

  useEffect(() => {
    if (isPresenter || !selfParticipantId) {
      return;
    }

    async function handleOffer(payload: ServerOfferPayload) {
      if (payload.roomId !== roomId || payload.targetId !== selfParticipantId) {
        return;
      }

      receiverPeerRef.current?.close();
      remoteStreamRef.current = new MediaStream();
      onConnectionState("connecting");
      onRemoteStream(remoteStreamRef.current);

      const peer = new RTCPeerConnection({ iceServers });
      receiverPeerRef.current = peer;

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
            targetId: presenterId,
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
      if (payload.roomId === roomId && payload.fromId === presenterId && receiverPeerRef.current) {
        try {
          await receiverPeerRef.current.addIceCandidate(payload.candidate);
        } catch {
          onConnectionState("failed");
        }
      }
    }

    socket.on(SOCKET_EVENTS.WEBRTC_OFFER, handleOffer);
    socket.on(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, handleIce);

    return () => {
      socket.off(SOCKET_EVENTS.WEBRTC_OFFER, handleOffer);
      socket.off(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, handleIce);
      closeReceiver();
    };
  }, [closeReceiver, iceServers, isPresenter, onConnectionState, onRemoteStream, presenterId, roomId, selfParticipantId, socket]);

  useEffect(() => {
    function handlePresenterStopped() {
      closeAll();
    }

    socket.on(SOCKET_EVENTS.PRESENTER_STOPPED_SHARING, handlePresenterStopped);
    socket.on(SOCKET_EVENTS.VIEWER_KICKED, handlePresenterStopped);

    return () => {
      socket.off(SOCKET_EVENTS.PRESENTER_STOPPED_SHARING, handlePresenterStopped);
      socket.off(SOCKET_EVENTS.VIEWER_KICKED, handlePresenterStopped);
    };
  }, [closeAll, socket]);

  useEffect(() => closeAll, [closeAll]);
}
