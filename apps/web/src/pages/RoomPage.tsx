import { LogOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ROOM_STATES, SOCKET_EVENTS, isValidRoomId, type RoomRole } from "@openshare/shared";
import { Button } from "../components/Button";
import { ConnectionStateBadge } from "../components/ConnectionStateBadge";
import { CopyLinkButton } from "../components/CopyLinkButton";
import { HostControls } from "../components/HostControls";
import { RoomStatus } from "../components/RoomStatus";
import { ScreenVideo } from "../components/ScreenVideo";
import { ViewerCount } from "../components/ViewerCount";
import { WebRTCStatusBadge } from "../components/WebRTCStatusBadge";
import { usePublicConfig } from "../hooks/usePublicConfig";
import { useRoom } from "../hooks/useRoom";
import { useScreenShare } from "../hooks/useScreenShare";
import { useSocket } from "../hooks/useSocket";
import { type WebRTCConnectionState, useWebRTC } from "../hooks/useWebRTC";

export function RoomPage() {
  const { roomId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const role: RoomRole = searchParams.get("role") === "host" ? "host" : "viewer";
  const inviteUrl = useMemo(() => `${window.location.origin}/room/${roomId}`, [roomId]);
  const { socket, connected } = useSocket();
  const { roomState, error: roomError } = useRoom(socket, roomId, role);
  const { iceServers, error: configError } = usePublicConfig();
  const screenShare = useScreenShare();
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [webRTCState, setWebRTCState] = useState<WebRTCConnectionState>("idle");
  const wasSharingRef = useRef(false);

  useWebRTC({
    socket,
    roomId,
    role,
    iceServers,
    localStream: screenShare.stream,
    onConnectionState: setWebRTCState,
    onRemoteStream: setRemoteStream
  });

  useEffect(() => {
    if (role !== "host") {
      return;
    }

    if (screenShare.stream) {
      wasSharingRef.current = true;
      return;
    }

    if (wasSharingRef.current) {
      wasSharingRef.current = false;
      socket.emit(SOCKET_EVENTS.HOST_STOPPED_SHARING, { roomId });
    }
  }, [role, roomId, screenShare.stream, socket]);

  async function handleStartSharing() {
    const stream = await screenShare.startSharing();
    if (stream) {
      socket.emit(SOCKET_EVENTS.HOST_STARTED_SHARING, { roomId });
    }
  }

  function handleStopSharing() {
    screenShare.stopSharing();
    if (role === "host") {
      socket.emit(SOCKET_EVENTS.HOST_STOPPED_SHARING, { roomId });
    }
  }

  function handleLeave() {
    handleStopSharing();
    socket.emit(SOCKET_EVENTS.ROOM_LEAVE);
    navigate("/");
  }

  if (!isValidRoomId(roomId)) {
    return <RoomShell message="This room link is invalid." />;
  }

  const visibleStream = role === "host" ? screenShare.stream : remoteStream;
  const videoLabel =
    roomState.state === ROOM_STATES.HOST_SHARING
      ? role === "host"
        ? "Your shared screen preview"
        : "Host shared screen"
      : statusVideoLabel(roomState.state, role);

  return (
    <main className="min-h-screen bg-mint px-4 py-5 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-md border-[3px] border-ink bg-cream px-4 py-4 shadow-sketch sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-wider text-ink/70">OpenShare</p>
            <h1 className="mt-1 text-2xl font-black text-ink sm:text-3xl">Room {roomId}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ConnectionStateBadge connected={connected} />
            <WebRTCStatusBadge state={webRTCState} />
            <ViewerCount count={roomState.viewerCount} />
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-4">
            <ScreenVideo stream={visibleStream} label={videoLabel} />
            <RoomStatus state={roomState.state} role={role} />
            {webRTCState === "failed" ? (
              <div className="rounded-md border-2 border-ink bg-coral px-4 py-3 text-sm font-bold text-ink shadow-soft">
                Peer connection failed. Try refreshing both room pages, or add a TURN server for stricter networks.
              </div>
            ) : null}
            {configError ? (
              <div className="rounded-md border-2 border-ink bg-cream px-4 py-3 text-sm font-bold text-ink shadow-soft">
                {configError}
              </div>
            ) : null}
            {role === "host" && screenShare.error ? (
              <div className="rounded-md border-2 border-ink bg-coral px-4 py-3 text-sm font-bold text-ink shadow-soft">
                {screenShare.error}
              </div>
            ) : null}
            {roomError ? (
              <div className="rounded-md border-2 border-ink bg-coral px-4 py-3 text-sm font-bold text-ink shadow-soft">{roomError}</div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-md border-[3px] border-ink bg-sky p-4 shadow-sketch">
              <p className="text-xs font-extrabold uppercase tracking-wider text-cream">
                {role === "host" ? "Host controls" : "Room controls"}
              </p>
              <div className="mt-4 flex flex-col gap-3">
                <CopyLinkButton url={inviteUrl} />
                {role === "host" ? (
                  <HostControls
                    isSharing={Boolean(screenShare.stream)}
                    isStarting={screenShare.isStarting}
                    canShare={screenShare.isSupported}
                    onStart={handleStartSharing}
                    onStop={handleStopSharing}
                  />
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleLeave}
                  icon={<LogOut aria-hidden className="h-4 w-4" />}
                  className="justify-start"
                >
                  Leave room
                </Button>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function RoomShell({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-mint px-4">
      <div className="rounded-md border-[3px] border-ink bg-cream px-6 py-5 text-sm font-bold text-ink shadow-sketch">{message}</div>
    </main>
  );
}

function statusVideoLabel(state: string, role: RoomRole): string {
  if (state === ROOM_STATES.HOST_STOPPED) {
    return "The host has stopped sharing.";
  }

  if (state === ROOM_STATES.HOST_DISCONNECTED) {
    return "The host disconnected.";
  }

  return role === "host" ? "Start sharing to show your screen here." : "Waiting for the host to start sharing...";
}
