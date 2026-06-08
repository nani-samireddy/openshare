import {
  CheckCheck,
  KeyRound,
  LockKeyhole,
  MessageCircle,
  Palette,
  Pencil,
  Presentation,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserMinus,
  Users,
  X
} from "lucide-react";
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
import { ControlSection } from "../components/ControlSection";
import { RoomStatus } from "../components/RoomStatus";
import { RoomInteractions } from "../components/RoomInteractions";
import { RoomQuickActions } from "../components/RoomQuickActions";
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
  const { stopSharing } = screenShare;
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [webRTCState, setWebRTCState] = useState<WebRTCConnectionState>("idle");
  const [presenterInviteOpen, setPresenterInviteOpen] = useState(false);
  const wasSharingRef = useRef(false);

  useEffect(() => {
    setViewerLimitInput(roomState.viewerLimit);
  }, [roomState.viewerLimit]);

  useWebRTC({
    socket,
    roomId,
    role,
    selfId: roomState.selfId,
    presenterId: roomState.presenterId,
    viewers: roomState.viewers,
    iceServers,
    localStream: screenShare.stream,
    onConnectionState: setWebRTCState,
    onRemoteStream: setRemoteStream
  });

  useEffect(() => {
    if (!roomState.selfIsPresenter) {
      wasSharingRef.current = false;
      if (screenShare.stream) {
        stopSharing();
      }
      return;
    }

    if (screenShare.stream) {
      wasSharingRef.current = true;
      return;
    }

    if (wasSharingRef.current) {
      wasSharingRef.current = false;
      socket.emit(SOCKET_EVENTS.PRESENTER_STOPPED_SHARING, { roomId });
    }
  }, [roomId, roomState.selfIsPresenter, screenShare.stream, socket, stopSharing]);

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

  useEffect(() => {
    if (role !== "viewer") {
      return;
    }

    function handlePresenterInvited(payload: { roomId: string }) {
      if (payload.roomId === roomId) {
        setPresenterInviteOpen(true);
      }
    }

    socket.on(SOCKET_EVENTS.PRESENTER_INVITED, handlePresenterInvited);
    return () => {
      socket.off(SOCKET_EVENTS.PRESENTER_INVITED, handlePresenterInvited);
    };
  }, [role, roomId, socket]);

  async function handleStartSharing() {
    const stream = await screenShare.startSharing();
    if (stream) {
      socket.emit(SOCKET_EVENTS.PRESENTER_STARTED_SHARING, { roomId });
    }
  }

  function handleStopSharing() {
    screenShare.stopSharing();
    if (roomState.selfIsPresenter) {
      socket.emit(SOCKET_EVENTS.PRESENTER_STOPPED_SHARING, { roomId });
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

  function handleInteractionSettings(settings: { chatEnabled?: boolean; reactionsEnabled?: boolean }) {
    socket.emit(SOCKET_EVENTS.ROOM_INTERACTION_SETTINGS, { roomId, ...settings });
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

  function handlePresenterInvite(viewerId: string) {
    socket.emit(SOCKET_EVENTS.PRESENTER_INVITE, { roomId, viewerId });
  }

  function handlePresenterResponse(accepted: boolean) {
    socket.emit(SOCKET_EVENTS.PRESENTER_RESPONSE, { roomId, accepted });
    setPresenterInviteOpen(false);
  }

  function handlePresenterReclaim() {
    socket.emit(SOCKET_EVENTS.PRESENTER_RECLAIM, { roomId });
  }

  if (!isValidRoomId(roomId)) {
    return <RoomShell message="This room link is invalid." />;
  }

  if (role === "host" && approvalState === "denied") {
    return <RoomShell message={roomError ?? "This browser is not authorized to host the room."} />;
  }

  const visibleStream = roomState.selfIsPresenter ? screenShare.stream : remoteStream;
  const videoLabel =
    roomState.state === ROOM_STATES.HOST_SHARING
      ? roomState.selfIsPresenter
        ? "Your shared screen preview"
        : `${roomState.presenterName}'s shared screen`
      : statusVideoLabel(roomState.state, roomState.presenterName, roomState.selfIsPresenter);

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
              canDraw={role === "host" || roomState.selfIsPresenter || roomState.viewerDrawingEnabled}
              isHost={role === "host"}
            />
            <RoomStatus state={roomState.state} role={role} presenterName={roomState.presenterName} selfIsPresenter={roomState.selfIsPresenter} />
            <RoomInteractions
              socket={socket}
              roomId={roomId}
              role={role}
              selfHandRaised={roomState.selfHandRaised}
              chatEnabled={roomState.chatEnabled}
              reactionsEnabled={roomState.reactionsEnabled}
              raisedHands={roomState.raisedHands}
            />
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
            {roomState.selfIsPresenter && screenShare.error ? (
              <div className="rounded-md border-2 border-ink bg-coral px-4 py-3 text-sm font-bold text-ink shadow-soft">
                {screenShare.error}
              </div>
            ) : null}
            {roomError ? (
              <div className="rounded-md border-2 border-ink bg-coral px-4 py-3 text-sm font-bold text-ink shadow-soft">{roomError}</div>
            ) : null}
          </div>

          <aside className="order-first flex flex-col gap-4 lg:order-none">
            <div className="rounded-md border-[3px] border-ink bg-sky p-4 shadow-sketch">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-extrabold uppercase tracking-wider text-cream">{role === "host" ? "Host controls" : "Room controls"}</p>
                <span className="rounded-full border-2 border-ink bg-cream px-2 py-0.5 text-xs font-extrabold text-ink">
                  {roomState.viewerCount}/{roomState.viewerLimit}
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <RoomQuickActions
                  inviteUrl={inviteUrl}
                  canPresent={roomState.selfIsPresenter}
                  isSharing={Boolean(screenShare.stream)}
                  isStarting={screenShare.isStarting}
                  canShare={screenShare.isSupported}
                  onStart={handleStartSharing}
                  onStop={handleStopSharing}
                  onLeave={handleLeave}
                />
                <div className="rounded-md border-2 border-ink bg-cream px-3 py-2 text-xs font-extrabold text-ink">
                  Presenter: {roomState.selfIsPresenter ? "You" : roomState.presenterName}
                </div>
                {role === "host" && roomState.presenterId !== "host" ? (
                  <button
                    type="button"
                    onClick={handlePresenterReclaim}
                    className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border-2 border-ink bg-sun px-3 text-xs font-extrabold text-ink"
                  >
                    <RotateCcw aria-hidden className="h-4 w-4" />
                    Reclaim presenter
                  </button>
                ) : null}
                {role === "host" ? (
                  <ControlSection
                    title="Access"
                    icon={<ShieldCheck aria-hidden className="h-4 w-4" />}
                    summary={`${roomState.locked ? "Locked" : roomState.accessMode === ROOM_ACCESS_MODES.OPEN ? "Open room" : "Approval required"} · ${
                      roomState.hasPassword ? "Password" : "No password"
                    }`}
                  >
                    <div className="grid grid-cols-2 gap-2">
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
                  </ControlSection>
                ) : null}
                {role === "host" ? (
                  <ControlSection
                    title="Preferences"
                    icon={<Palette aria-hidden className="h-4 w-4" />}
                    summary={`Drawing ${roomState.viewerDrawingEnabled ? "on" : "off"} · Chat ${roomState.chatEnabled ? "on" : "off"}`}
                  >
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
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        aria-pressed={roomState.chatEnabled}
                        onClick={() => handleInteractionSettings({ chatEnabled: !roomState.chatEnabled })}
                        className={`min-h-10 rounded-md border-2 border-ink px-2 text-xs font-extrabold ${
                          roomState.chatEnabled ? "bg-sun" : "bg-white"
                        }`}
                      >
                        Chat
                      </button>
                      <button
                        type="button"
                        aria-pressed={roomState.reactionsEnabled}
                        onClick={() => handleInteractionSettings({ reactionsEnabled: !roomState.reactionsEnabled })}
                        className={`min-h-10 rounded-md border-2 border-ink px-2 text-xs font-extrabold ${
                          roomState.reactionsEnabled ? "bg-sun" : "bg-white"
                        }`}
                      >
                        Reactions
                      </button>
                    </div>
                  </ControlSection>
                ) : null}
                {role === "host" ? (
                  <ControlSection
                    title="Participants"
                    icon={<Users aria-hidden className="h-4 w-4" />}
                    summary={`${roomState.viewerCount} viewers · ${pendingRequests.length} waiting · ${roomState.raisedHands.length} hands`}
                    badge={pendingRequests.length + roomState.raisedHands.length}
                  >
                    {pendingRequests.length > 0 ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            className="min-h-9 px-2 text-xs"
                            icon={<CheckCheck aria-hidden className="h-4 w-4" />}
                            onClick={() => handleBulkApproval("approve")}
                          >
                            Approve all
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            className="min-h-9 px-2 text-xs"
                            icon={<X aria-hidden className="h-4 w-4" />}
                            onClick={() => handleBulkApproval("deny")}
                          >
                            Deny all
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-col gap-2">
                          {pendingRequests.map((request) => (
                            <div key={request.requestId} className="flex items-center justify-between gap-2 rounded-md border-2 border-ink bg-white px-2 py-2">
                              <span className="min-w-0 truncate text-xs font-extrabold text-ink">{request.displayName}</span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  aria-label={`Approve ${request.displayName}`}
                                  onClick={() => handleApproval(request.requestId, true)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border-2 border-ink bg-sun"
                                >
                                  <CheckCheck aria-hidden className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Deny ${request.displayName}`}
                                  onClick={() => handleApproval(request.requestId, false)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border-2 border-ink bg-coral"
                                >
                                  <X aria-hidden className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                    {roomState.viewers.length > 0 ? (
                      <div className="mt-2 flex flex-col gap-2">
                        {roomState.viewers.map((viewer) => (
                          <div key={viewer.viewerId} className="flex items-center justify-between gap-3 rounded-md border-2 border-ink bg-white px-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-ink">{viewer.displayName}</span>
                            {roomState.presenterId === viewer.viewerId ? (
                              <span className="rounded-full border-2 border-ink bg-sun px-2 py-1 text-[10px] font-extrabold uppercase">Live</span>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Invite ${viewer.displayName} to present`}
                                title={`Invite ${viewer.displayName} to present`}
                                onClick={() => handlePresenterInvite(viewer.viewerId)}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-sun"
                              >
                                <Presentation aria-hidden className="h-4 w-4" />
                              </button>
                            )}
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
                    ) : null}
                    {pendingRequests.length === 0 && roomState.viewers.length === 0 ? (
                      <p className="text-xs font-bold text-ink/60">No participants yet.</p>
                    ) : null}
                  </ControlSection>
                ) : null}
                {role === "viewer" ? (
                  <>
                    {presenterInviteOpen ? (
                      <div className="rounded-md border-2 border-ink bg-sun p-3 text-ink">
                        <p className="text-xs font-extrabold uppercase tracking-wider">Present?</p>
                        <p className="mt-1 text-sm font-bold">The host invited you to share your screen.</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handlePresenterResponse(true)}
                            className="min-h-10 rounded-md border-2 border-ink bg-cream text-xs font-extrabold"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePresenterResponse(false)}
                            className="min-h-10 rounded-md border-2 border-ink bg-coral text-xs font-extrabold"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <ControlSection
                      title="Room"
                      icon={<MessageCircle aria-hidden className="h-4 w-4" />}
                      summary={`Presenter: ${roomState.selfIsPresenter ? "You" : roomState.presenterName}`}
                    >
                      <p className="text-xs font-bold text-ink/70">
                        {roomState.selfIsPresenter
                          ? "You can start sharing from the quick controls."
                          : roomState.locked
                            ? "The room is locked to new viewers."
                            : roomState.accessMode === ROOM_ACCESS_MODES.OPEN
                              ? "This is an open room."
                              : "New viewers need host approval."}
                      </p>
                    </ControlSection>
                  </>
                ) : null}
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

function statusVideoLabel(state: string, presenterName: string, selfIsPresenter: boolean): string {
  if (state === ROOM_STATES.HOST_STOPPED) {
    return `${presenterName} has stopped sharing.`;
  }

  if (state === ROOM_STATES.HOST_DISCONNECTED) {
    return "The host disconnected.";
  }

  return selfIsPresenter ? "Start sharing to show your screen here." : `Waiting for ${presenterName} to start sharing...`;
}
