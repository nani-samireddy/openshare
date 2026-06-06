import { randomBytes } from "node:crypto";
import {
  ROOM_ACCESS_MODES,
  DEFAULT_VIEWER_LIMIT,
  MAX_VIEWER_LIMIT,
  ROOM_ID_LENGTH,
  ROOM_STATES,
  type RoomAccessMode,
  type RoomStatePayload,
  isValidRoomId
} from "@openshare/shared";
import type { PersistedRoom, RoomPersistence } from "./room-persistence.js";
import { verifySecret } from "./room-security.js";

export type ViewerRecord = {
  socketId: string;
  displayName: string;
};

export type PendingViewerRecord = ViewerRecord & {
  requestId: string;
};

export type Room = {
  id: string;
  hostSocketId: string | null;
  viewers: Map<string, ViewerRecord>;
  pendingViewers: Map<string, PendingViewerRecord>;
  accessMode: RoomAccessMode;
  viewerDrawingEnabled: boolean;
  passwordHash: string | null;
  hostTokenHash: string | null;
  locked: boolean;
  viewerLimit: number;
  persistent: boolean;
  chatEnabled: boolean;
  reactionsEnabled: boolean;
  raisedHands: Set<string>;
  isSharing: boolean;
  wasSharing: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CreateRoomOptions = {
  accessMode?: RoomAccessMode;
  passwordHash?: string | null;
  hostTokenHash?: string | null;
  locked?: boolean;
  viewerLimit?: number;
  persistent?: boolean;
  chatEnabled?: boolean;
  reactionsEnabled?: boolean;
};

export type SocketRoomMembership = {
  roomId: string;
  role: "host" | "viewer" | "pending_viewer";
  participantId?: string;
  displayName?: string;
};

export class RoomStore {
  private readonly rooms = new Map<string, Room>();
  private readonly socketMemberships = new Map<string, SocketRoomMembership>();
  private persistenceQueue = Promise.resolve();

  constructor(
    private readonly persistence?: RoomPersistence,
    private readonly ttlMs = 30 * 60 * 1000
  ) {}

  async initialize(now = Date.now()): Promise<void> {
    if (!this.persistence) {
      return;
    }

    const persistedRooms = await this.persistence.loadRooms();
    for (const persistedRoom of persistedRooms) {
      if (!isValidRoomId(persistedRoom.id) || now - persistedRoom.updatedAt >= this.ttlMs) {
        this.queueDelete(persistedRoom.id);
        continue;
      }

      this.rooms.set(persistedRoom.id, {
        ...persistedRoom,
        passwordHash: persistedRoom.passwordHash ?? null,
        hostTokenHash: persistedRoom.hostTokenHash ?? null,
        locked: persistedRoom.locked ?? false,
        viewerLimit: this.normalizeViewerLimit(persistedRoom.viewerLimit),
        persistent: persistedRoom.persistent ?? false,
        chatEnabled: persistedRoom.chatEnabled ?? true,
        reactionsEnabled: persistedRoom.reactionsEnabled ?? true,
        raisedHands: new Set(),
        hostSocketId: null,
        viewers: new Map(),
        pendingViewers: new Map(),
        isSharing: false
      });
    }
  }

  async flushPersistence(): Promise<void> {
    await this.persistenceQueue;
  }

  createRoom(options: RoomAccessMode | CreateRoomOptions = ROOM_ACCESS_MODES.APPROVAL, now = Date.now()): Room {
    const roomOptions: CreateRoomOptions = typeof options === "string" ? { accessMode: options } : options;
    let id = this.createRoomId();
    while (this.rooms.has(id)) {
      id = this.createRoomId();
    }

    const room: Room = {
      id,
      hostSocketId: null,
      viewers: new Map(),
      pendingViewers: new Map(),
      accessMode: roomOptions.accessMode ?? ROOM_ACCESS_MODES.APPROVAL,
      viewerDrawingEnabled: true,
      passwordHash: roomOptions.passwordHash ?? null,
      hostTokenHash: roomOptions.hostTokenHash ?? null,
      locked: roomOptions.locked ?? false,
      viewerLimit: this.normalizeViewerLimit(roomOptions.viewerLimit),
      persistent: roomOptions.persistent ?? false,
      chatEnabled: roomOptions.chatEnabled ?? true,
      reactionsEnabled: roomOptions.reactionsEnabled ?? true,
      raisedHands: new Set(),
      isSharing: false,
      wasSharing: false,
      createdAt: now,
      updatedAt: now
    };
    this.rooms.set(id, room);
    this.queueSave(room);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  requireRoom(roomId: string): Room {
    if (!isValidRoomId(roomId)) {
      throw new Error("Invalid room id");
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    return room;
  }

  joinHost(roomId: string, socketId: string, hostTokenOrNow: string | number | undefined = "", now = Date.now()): Room {
    const room = this.requireRoom(roomId);
    const hostToken = typeof hostTokenOrNow === "string" ? hostTokenOrNow : "";
    const joinedAt = typeof hostTokenOrNow === "number" ? hostTokenOrNow : now;
    if (room.hostTokenHash && !verifySecret(hostToken, room.hostTokenHash)) {
      throw new Error("Invalid host token");
    }
    room.hostSocketId = socketId;
    room.updatedAt = joinedAt;
    this.socketMemberships.set(socketId, { roomId, role: "host" });
    this.queueSave(room);
    return room;
  }

  requestViewerJoin(
    roomId: string,
    socketId: string,
    displayName: string,
    passwordOrNow: string | number | undefined = "",
    now = Date.now()
  ): { room: Room; requestId: string } {
    const room = this.requireRoom(roomId);
    const password = typeof passwordOrNow === "string" ? passwordOrNow : "";
    const joinedAt = typeof passwordOrNow === "number" ? passwordOrNow : now;
    if (room.locked) {
      throw new Error("This room is locked");
    }
    if (room.passwordHash && !verifySecret(password, room.passwordHash)) {
      throw new Error("Incorrect room password");
    }
    if (room.viewers.size + room.pendingViewers.size >= room.viewerLimit) {
      throw new Error("This room is full");
    }
    const requestId = this.createParticipantId();
    const normalizedName = this.normalizeDisplayName(displayName);
    room.pendingViewers.set(requestId, { requestId, socketId, displayName: normalizedName });
    room.updatedAt = joinedAt;
    this.socketMemberships.set(socketId, {
      roomId,
      role: "pending_viewer",
      participantId: requestId,
      displayName: normalizedName
    });
    this.queueSave(room);
    return { room, requestId };
  }

  approveViewer(roomId: string, requestId: string, now = Date.now()): { room: Room; viewerId: string; viewer: ViewerRecord } {
    const room = this.requireRoom(roomId);
    const pendingViewer = room.pendingViewers.get(requestId);
    if (!pendingViewer) {
      throw new Error("Join request not found");
    }
    if (room.viewers.size >= room.viewerLimit) {
      throw new Error("This room is full");
    }

    const viewerId = this.createParticipantId();
    const viewer = {
      socketId: pendingViewer.socketId,
      displayName: pendingViewer.displayName
    };
    room.pendingViewers.delete(requestId);
    room.viewers.set(viewerId, viewer);
    room.updatedAt = now;
    this.socketMemberships.set(pendingViewer.socketId, {
      roomId,
      role: "viewer",
      participantId: viewerId,
      displayName: viewer.displayName
    });
    this.queueSave(room);
    return { room, viewerId, viewer };
  }

  denyViewer(roomId: string, requestId: string, now = Date.now()): PendingViewerRecord {
    const room = this.requireRoom(roomId);
    const pendingViewer = room.pendingViewers.get(requestId);
    if (!pendingViewer) {
      throw new Error("Join request not found");
    }

    room.pendingViewers.delete(requestId);
    room.updatedAt = now;
    this.socketMemberships.delete(pendingViewer.socketId);
    this.queueSave(room);
    return pendingViewer;
  }

  setAccessMode(roomId: string, accessMode: RoomAccessMode, now = Date.now()): Room {
    const room = this.requireRoom(roomId);
    room.accessMode = accessMode;
    room.updatedAt = now;
    this.queueSave(room);
    return room;
  }

  setViewerDrawingEnabled(roomId: string, enabled: boolean, now = Date.now()): Room {
    const room = this.requireRoom(roomId);
    room.viewerDrawingEnabled = enabled;
    room.updatedAt = now;
    this.queueSave(room);
    return room;
  }

  setInteractionSettings(roomId: string, settings: { chatEnabled?: boolean; reactionsEnabled?: boolean }, now = Date.now()): Room {
    const room = this.requireRoom(roomId);
    if (settings.chatEnabled !== undefined) {
      room.chatEnabled = settings.chatEnabled;
    }
    if (settings.reactionsEnabled !== undefined) {
      room.reactionsEnabled = settings.reactionsEnabled;
    }
    room.updatedAt = now;
    this.queueSave(room);
    return room;
  }

  setRaisedHand(roomId: string, viewerId: string, raised: boolean, now = Date.now()): Room {
    const room = this.requireRoom(roomId);
    if (!room.viewers.has(viewerId)) {
      throw new Error("Viewer not found");
    }
    if (raised) {
      room.raisedHands.add(viewerId);
    } else {
      room.raisedHands.delete(viewerId);
    }
    room.updatedAt = now;
    return room;
  }

  setSecurity(
    roomId: string,
    settings: { locked?: boolean; viewerLimit?: number; passwordHash?: string | null; persistent?: boolean },
    now = Date.now()
  ): Room {
    const room = this.requireRoom(roomId);
    if (settings.locked !== undefined) {
      room.locked = settings.locked;
    }
    if (settings.viewerLimit !== undefined) {
      room.viewerLimit = this.normalizeViewerLimit(settings.viewerLimit);
    }
    if (settings.passwordHash !== undefined) {
      room.passwordHash = settings.passwordHash;
    }
    if (settings.persistent !== undefined) {
      room.persistent = settings.persistent;
    }
    room.updatedAt = now;
    this.queueSave(room);
    return room;
  }

  kickViewer(roomId: string, viewerId: string, now = Date.now()): ViewerRecord {
    const room = this.requireRoom(roomId);
    const viewer = room.viewers.get(viewerId);
    if (!viewer) {
      throw new Error("Viewer not found");
    }

    room.viewers.delete(viewerId);
    room.raisedHands.delete(viewerId);
    this.socketMemberships.delete(viewer.socketId);
    room.updatedAt = now;
    this.queueSave(room);
    return viewer;
  }

  markSharing(roomId: string, isSharing: boolean, now = Date.now()): Room {
    const room = this.requireRoom(roomId);
    room.isSharing = isSharing;
    room.wasSharing = room.wasSharing || isSharing;
    room.updatedAt = now;
    this.queueSave(room);
    return room;
  }

  getMembership(socketId: string): SocketRoomMembership | undefined {
    return this.socketMemberships.get(socketId);
  }

  getHostSocketId(roomId: string): string | undefined {
    return this.rooms.get(roomId)?.hostSocketId ?? undefined;
  }

  getViewerSocketId(roomId: string, viewerId: string): string | undefined {
    return this.rooms.get(roomId)?.viewers.get(viewerId)?.socketId;
  }

  getViewer(roomId: string, viewerId: string): ViewerRecord | undefined {
    return this.rooms.get(roomId)?.viewers.get(viewerId);
  }

  leaveBySocket(socketId: string, now = Date.now()): SocketRoomMembership | undefined {
    const membership = this.socketMemberships.get(socketId);
    if (!membership) {
      return undefined;
    }

    const room = this.rooms.get(membership.roomId);
    if (room) {
      if (membership.role === "host" && room.hostSocketId === socketId) {
        room.hostSocketId = null;
        room.isSharing = false;
      }

      if (membership.role === "viewer" && membership.participantId) {
        room.viewers.delete(membership.participantId);
        room.raisedHands.delete(membership.participantId);
      }

      if (membership.role === "pending_viewer" && membership.participantId) {
        room.pendingViewers.delete(membership.participantId);
      }

      room.updatedAt = now;
      this.queueSave(room);
    }

    this.socketMemberships.delete(socketId);
    return membership;
  }

  deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    if (room.hostSocketId) {
      this.socketMemberships.delete(room.hostSocketId);
    }

    for (const viewer of room.viewers.values()) {
      this.socketMemberships.delete(viewer.socketId);
    }

    for (const pendingViewer of room.pendingViewers.values()) {
      this.socketMemberships.delete(pendingViewer.socketId);
    }

    this.rooms.delete(roomId);
    this.queueDelete(roomId);
  }

  cleanupInactiveRooms(ttlMs: number, now = Date.now()): string[] {
    const removed: string[] = [];
    for (const room of this.rooms.values()) {
      if (now - room.updatedAt >= ttlMs) {
        this.deleteRoom(room.id);
        removed.push(room.id);
      }
    }
    return removed;
  }

  getState(roomId: string, selfId?: string, includeViewers = false): RoomStatePayload {
    const room = this.requireRoom(roomId);
    let state: RoomStatePayload["state"] = ROOM_STATES.WAITING_FOR_HOST;

    if (!room.hostSocketId) {
      state = room.wasSharing ? ROOM_STATES.HOST_DISCONNECTED : ROOM_STATES.WAITING_FOR_HOST;
    } else if (room.isSharing) {
      state = ROOM_STATES.HOST_SHARING;
    } else if (room.wasSharing) {
      state = ROOM_STATES.HOST_STOPPED;
    }

    return {
      roomId,
      state,
      accessMode: room.accessMode,
      viewerDrawingEnabled: room.viewerDrawingEnabled,
      locked: room.locked,
      hasPassword: Boolean(room.passwordHash),
      viewerLimit: room.viewerLimit,
      persistent: room.persistent,
      chatEnabled: room.chatEnabled,
      reactionsEnabled: room.reactionsEnabled,
      viewerCount: room.viewers.size,
      viewers: includeViewers
        ? Array.from(room.viewers.entries(), ([viewerId, viewer]) => ({
            viewerId,
            displayName: viewer.displayName
          }))
        : [],
      raisedHands: includeViewers
        ? Array.from(room.raisedHands, (viewerId) => ({
            viewerId,
            displayName: room.viewers.get(viewerId)?.displayName ?? "Viewer"
          }))
        : [],
      selfHandRaised: Boolean(selfId && room.raisedHands.has(selfId)),
      isHostPresent: Boolean(room.hostSocketId),
      isSharing: room.isSharing,
      ...(selfId ? { selfId } : {})
    };
  }

  private createRoomId(): string {
    return randomBytes(8).toString("base64url").slice(0, ROOM_ID_LENGTH);
  }

  private createParticipantId(): string {
    return `viewer_${randomBytes(8).toString("base64url")}`;
  }

  private normalizeDisplayName(displayName: string): string {
    const trimmed = displayName.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      throw new Error("Display name is required");
    }

    return trimmed.slice(0, 40);
  }

  private queueSave(room: Room): void {
    if (!this.persistence) {
      return;
    }

    const persistedRoom: PersistedRoom = {
      id: room.id,
      accessMode: room.accessMode,
      viewerDrawingEnabled: room.viewerDrawingEnabled,
      passwordHash: room.passwordHash,
      hostTokenHash: room.hostTokenHash,
      locked: room.locked,
      viewerLimit: room.viewerLimit,
      persistent: room.persistent,
      chatEnabled: room.chatEnabled,
      reactionsEnabled: room.reactionsEnabled,
      wasSharing: room.wasSharing,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt
    };
    const ttlSeconds = Math.max(1, Math.ceil(this.ttlMs / 1000));
    this.queuePersistence(() => this.persistence!.saveRoom(persistedRoom, ttlSeconds));
  }

  private queueDelete(roomId: string): void {
    if (!this.persistence) {
      return;
    }

    this.queuePersistence(() => this.persistence!.deleteRoom(roomId));
  }

  private queuePersistence(operation: () => Promise<void>): void {
    this.persistenceQueue = this.persistenceQueue.then(operation).catch((error: unknown) => {
      console.error("Room persistence operation failed", error);
    });
  }

  private normalizeViewerLimit(viewerLimit: number | undefined): number {
    if (!Number.isInteger(viewerLimit)) {
      return DEFAULT_VIEWER_LIMIT;
    }
    return Math.min(MAX_VIEWER_LIMIT, Math.max(1, viewerLimit!));
  }
}
