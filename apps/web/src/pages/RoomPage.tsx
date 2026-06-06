import { CheckCheck, KeyRound, LockKeyhole, LogOut, Pencil, RefreshCw, ShieldCheck, UserMinus, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ROOM_ACCESS_MODES,
  ROOM_STATES,
  SOCKET_EVENTS,
  isValidRoomId,
  type RoomAccessMode,
  type RoomRole,
  type ViewerRequestedPayload
} from "@openshare/shared";
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
import { getHostToken } from "../lib/hostSession";

export function RoomPage() {
  const { roomId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const hostToken = useMemo(() => getHostToken(roomId), [roomId]);
  const role: RoomRole = searchParams.get("role") === "host" && hostToken ? "host" : "viewer";
  const inviteUrl = useMemo(() => `${window.location.origin}/room/${roomId}`, [roomId]);
  const { socket, connected } = useSocket();
  const [viewerNameInput, setViewerNameInput] = useState("");
  const [viewerDisplayName, setViewerDisplayName] = useState("");
  const [viewerPasswordInput, setViewerPasswordInput] = useState("");
  const [viewerPassword, setViewerPassword] = useState("");
  const [newRoomPassword, setNewRoomPassword] = useState("");
  const [viewerLimitInput, setViewerLimitInput] = useState(20);
  const [hasRequestedJoin, setHasRequestedJoin] = useState(role === "host");
  const [pendingRequests, setPendingRequests] = useState<ViewerRequestedPayload[]>([]);
  const { roomState, error: roomError, approvalState } = useRoom({
    socket,
    roomId,
    role,
    displayName: viewerDisplayName,
    password: viewerPassword,
    hostToken,
    shouldJoin: role === "host" || hasRequestedJoin
  });
  const { iceServers, error: configError } = usePublicConfig();
  const screenShare = useScreenShare();
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [webRTCState, setWebRTCState] = useState<WebRTCConnectionState>("idle");
  const wasSharingRef = useRef(false);

  useEffect(() => {
    setViewerLimitInput(roomState.viewerLimit);
  }, [roomState.viewerLimit]);

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

  useEffect(() => {
    if (role !== "host") {
      return;
    }

    function handleViewerRequested(payload: ViewerRequestedPayload) {
      if (payload.roomId !== roomId) {
        return;
      }

      setPendingRequests((current) => {
        if (current.some((request) => request.requestId === payload.requestId)) {
          return current;
        }
        return [...current, payload];
      });
    }

    socket.on(SOCKET_EVENTS.VIEWER_REQUESTED, handleViewerRequested);
    return () => {
      socket.off(SOCKET_EVENTS.VIEWER_REQUESTED, handleViewerRequested);
    };
  }, [role, roomId, socket]);

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

  function handleViewerJoinSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = viewerNameInput.trim().replace(/\s+/g, " ");
    if (!nextName) {
      return;
    }

    setViewerDisplayName(nextName.slice(0, 40));
    setViewerPassword(viewerPasswordInput);
    setHasRequestedJoin(true);
  }

  function handleApproval(requestId: string, approved: boolean) {
    socket.emit(SOCKET_EVENTS.VIEWER_APPROVAL, { roomId, requestId, approved });
    setPendingRequests((current) => current.filter((request) => request.requestId !== requestId));
  }

  function handleBulkApproval(action: "approve" | "deny") {
    socket.emit(SOCKET_EVENTS.VIEWER_APPROVAL_BULK, { roomId, action });
    setPendingRequests([]);
  }

  function handleAccessMode(accessMode: RoomAccessMode) {
    socket.emit(SOCKET_EVENTS.ROOM_ACCESS_MODE, { roomId, accessMode });
    if (accessMode === ROOM_ACCESS_MODES.OPEN) {
      setPendingRequests([]);
    }
  }

  function handleViewerDrawing(enabled: boolean) {
    socket.emit(SOCKET_EVENTS.ANNOTATION_VIEWER_DRAWING, { roomId, enabled });
  }

  function handleSecurity(settings: { locked?: boolean; viewerLimit?: number; password?: string; clearPassword?: boolean; persistent?: boolean }) {
    socket.emit(SOCKET_EVENTS.ROOM_SECURITY, { roomId, ...settings });
  }

  function handleSetPassword() {
    const password = newRoomPassword.trim();
    if (password.length < 4) {
      return;
    }
    handleSecurity({ password });
    setNewRoomPassword("");
  }

  function handleKickViewer(viewerId: string) {
    socket.emit(SOCKET_EVENTS.VIEWER_KICK, { roomId, viewerId });
  }

  if (!isValidRoomId(roomId)) {
    return <RoomShell message="This room link is invalid." />;
  }

  if (role === "host" && approvalState === "denied") {
    return <RoomShell message={roomError ?? "This browser is not authorized to host the room."} />;
  }

  const visibleStream = role === "host" ? screenShare.stream : remoteStream;
  const videoLabel =
    roomState.state === ROOM_STATES.HOST_SHARING
      ? role === "host"
        ? "Your shared screen preview"
        : "Host shared screen"
      : statusVideoLabel(roomState.state, role);

  if (role === "viewer" && approvalState !== "approved") {
    return (
      <main className="min-h-screen bg-mint px-4 py-5 text-ink sm:px-6 lg:px-8">
        <section className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-xl items-center">
          <div className="w-full rounded-md border-[3px] border-ink bg-cream p-5 shadow-sketch">
            <p className="text-sm font-extrabold uppercase tracking-wider text-ink/70">OpenShare</p>
            <h1 className="mt-2 text-3xl font-black text-ink">Join room {roomId}</h1>
            {approvalState === "pending" ? (
              <div className="mt-5 rounded-md border-2 border-ink bg-sun px-4 py-3 text-sm font-extrabold text-ink">
                Waiting for the host to approve you.
              </div>
            ) : (
              <form className="mt-5 flex flex-col gap-3" onSubmit={handleViewerJoinSubmit}>
                <label className="text-sm font-extrabold text-ink" htmlFor="viewer-name">
                  Your name
                </label>
                <input
                  id="viewer-name"
                  value={viewerNameInput}
                  onChange={(event) => setViewerNameInput(event.target.value)}
                  maxLength={40}
                  placeholder="Nani"
                  className="min-h-12 rounded-md border-2 border-ink bg-white px-4 text-base font-bold text-ink outline-none focus:ring-4 focus:ring-sun/60"
                />
                <label className="text-sm font-extrabold text-ink" htmlFor="viewer-password">
                  Room password <span className="text-ink/60">(if required)</span>
                </label>
                <input
                  id="viewer-password"
                  type="password"
                  value={viewerPasswordInput}
                  onChange={(event) => setViewerPasswordInput(event.target.value)}
                  maxLength={64}
                  placeholder="Room password"
                  className="min-h-12 rounded-md border-2 border-ink bg-white px-4 text-base font-bold text-ink outline-none focus:ring-4 focus:ring-sun/60"
                />
                <Button type="submit" disabled={!viewerNameInput.trim()}>
                  Join room
                </Button>
              </form>
            )}
            {roomError ? (
              <div className="mt-4 rounded-md border-2 border-ink bg-coral px-4 py-3 text-sm font-bold text-ink shadow-soft">{roomError}</div>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

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
            <ScreenVideo
              stream={visibleStream}
              label={videoLabel}
              socket={socket}
              roomId={roomId}
              isSharing={roomState.isSharing}
              canDraw={role === "host" || roomState.viewerDrawingEnabled}
              isHost={role === "host"}
            />
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
                {role === "host" ? (
                  <div className="rounded-md border-2 border-ink bg-cream p-3">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-ink/70">Room access</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        aria-pressed={roomState.accessMode === ROOM_ACCESS_MODES.APPROVAL}
                        onClick={() => handleAccessMode(ROOM_ACCESS_MODES.APPROVAL)}
                        className={`flex min-h-11 items-center justify-center gap-2 rounded-md border-2 border-ink px-2 text-xs font-extrabold ${
                          roomState.accessMode === ROOM_ACCESS_MODES.APPROVAL ? "bg-sun shadow-[3px_3px_0_#26304f]" : "bg-white"
                        }`}
                      >
                        <ShieldCheck aria-hidden className="h-4 w-4" />
                        Approval
                      </button>
                      <button
                        type="button"
                        aria-pressed={roomState.accessMode === ROOM_ACCESS_MODES.OPEN}
                        onClick={() => handleAccessMode(ROOM_ACCESS_MODES.OPEN)}
                        className={`flex min-h-11 items-center justify-center gap-2 rounded-md border-2 border-ink px-2 text-xs font-extrabold ${
                          roomState.accessMode === ROOM_ACCESS_MODES.OPEN ? "bg-sun shadow-[3px_3px_0_#26304f]" : "bg-white"
                        }`}
                      >
                        <Users aria-hidden className="h-4 w-4" />
                        Open
                      </button>
                    </div>
                    <p className="mt-3 text-xs font-bold text-ink/75">
                      {roomState.accessMode === ROOM_ACCESS_MODES.OPEN
                        ? "Named viewers join automatically."
                        : "New viewers wait for host approval."}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border-2 border-ink bg-cream px-3 py-2 text-xs font-extrabold text-ink">
                    {roomState.accessMode === ROOM_ACCESS_MODES.OPEN ? "Open room" : "Host approval required"}
                  </div>
                )}
                {role === "host" ? (
                  <div className="rounded-md border-2 border-ink bg-cream p-3">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-ink/70">Room security</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        aria-pressed={roomState.locked}
                        onClick={() => handleSecurity({ locked: !roomState.locked })}
                        className={`flex min-h-11 items-center justify-center gap-2 rounded-md border-2 border-ink px-2 text-xs font-extrabold ${
                          roomState.locked ? "bg-coral shadow-[3px_3px_0_#26304f]" : "bg-white"
                        }`}
                      >
                        <LockKeyhole aria-hidden className="h-4 w-4" />
                        {roomState.locked ? "Locked" : "Unlocked"}
                      </button>
                      <button
                        type="button"
                        aria-pressed={roomState.persistent}
                        onClick={() => handleSecurity({ persistent: !roomState.persistent })}
                        className={`flex min-h-11 items-center justify-center gap-2 rounded-md border-2 border-ink px-2 text-xs font-extrabold ${
                          roomState.persistent ? "bg-sun shadow-[3px_3px_0_#26304f]" : "bg-white"
                        }`}
                      >
                        <RefreshCw aria-hidden className="h-4 w-4" />
                        {roomState.persistent ? "Reusable" : "One-time"}
                      </button>
                    </div>
                    <label className="mt-3 block text-xs font-extrabold text-ink/75">
                      Viewer limit
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={viewerLimitInput}
                        onChange={(event) => setViewerLimitInput(Math.min(100, Math.max(1, Number(event.target.value))))}
                        onBlur={() => handleSecurity({ viewerLimit: viewerLimitInput })}
                        className="mt-1 min-h-10 w-full rounded-md border-2 border-ink bg-white px-3 font-bold text-ink"
                      />
                    </label>
                    <div className="mt-3 flex gap-2">
                      <input
                        type="password"
                        value={newRoomPassword}
                        onChange={(event) => setNewRoomPassword(event.target.value)}
                        maxLength={64}
                        placeholder={roomState.hasPassword ? "Replace password" : "Set password"}
                        className="min-h-10 min-w-0 flex-1 rounded-md border-2 border-ink bg-white px-3 text-xs font-bold text-ink"
                      />
                      <button
                        type="button"
                        aria-label="Set room password"
                        title="Set room password"
                        disabled={newRoomPassword.trim().length < 4}
                        onClick={handleSetPassword}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-ink bg-sun disabled:opacity-50"
                      >
                        <KeyRound aria-hidden className="h-4 w-4" />
                      </button>
                      {roomState.hasPassword ? (
                        <button
                          type="button"
                          aria-label="Remove room password"
                          title="Remove room password"
                          onClick={() => handleSecurity({ clearPassword: true })}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-ink bg-coral"
                        >
                          <X aria-hidden className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {role === "host" ? (
                  <div className="rounded-md border-2 border-ink bg-cream p-3">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-ink/70">Annotations</p>
                    <button
                      type="button"
                      aria-pressed={roomState.viewerDrawingEnabled}
                      onClick={() => handleViewerDrawing(!roomState.viewerDrawingEnabled)}
                      className={`mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border-2 border-ink px-3 text-xs font-extrabold ${
                        roomState.viewerDrawingEnabled ? "bg-sun shadow-[3px_3px_0_#26304f]" : "bg-white"
                      }`}
                    >
                      <Pencil aria-hidden className="h-4 w-4" />
                      {roomState.viewerDrawingEnabled ? "Viewer drawing enabled" : "Viewer drawing disabled"}
                    </button>
                  </div>
                ) : null}
                {role === "host" && pendingRequests.length > 0 ? (
                  <div className="rounded-md border-2 border-ink bg-cream p-3">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-ink/70">Join requests</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        className="min-h-10 px-2 text-xs"
                        icon={<CheckCheck aria-hidden className="h-4 w-4" />}
                        onClick={() => handleBulkApproval("approve")}
                      >
                        Approve all
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        className="min-h-10 px-2 text-xs"
                        icon={<X aria-hidden className="h-4 w-4" />}
                        onClick={() => handleBulkApproval("deny")}
                      >
                        Deny all
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-col gap-3">
                      {pendingRequests.map((request) => (
                        <div key={request.requestId} className="rounded-md border-2 border-ink bg-white p-3">
                          <p className="text-sm font-extrabold text-ink">{request.displayName}</p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button type="button" className="min-h-10 px-3" onClick={() => handleApproval(request.requestId, true)}>
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              className="min-h-10 px-3"
                              onClick={() => handleApproval(request.requestId, false)}
                            >
                              Deny
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {role === "host" && roomState.viewers.length > 0 ? (
                  <div className="rounded-md border-2 border-ink bg-cream p-3">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-ink/70">Viewers</p>
                    <div className="mt-3 flex flex-col gap-2">
                      {roomState.viewers.map((viewer) => (
                        <div key={viewer.viewerId} className="flex items-center justify-between gap-3 rounded-md border-2 border-ink bg-white px-3 py-2">
                          <span className="min-w-0 truncate text-sm font-extrabold text-ink">{viewer.displayName}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${viewer.displayName}`}
                            title={`Remove ${viewer.displayName}`}
                            onClick={() => handleKickViewer(viewer.viewerId)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-coral"
                          >
                            <UserMinus aria-hidden className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
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
