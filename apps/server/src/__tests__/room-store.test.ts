import { describe, expect, it } from "vitest";
import { ROOM_ACCESS_MODES, ROOM_STATES } from "@openshare/shared";
import type { PersistedRoom, RoomPersistence } from "../rooms/room-persistence.js";
import { RoomStore } from "../rooms/room-store.js";

describe("RoomStore", () => {
  it("creates short URL-safe rooms", () => {
    const store = new RoomStore();
    const room = store.createRoom();
    expect(room.id).toMatch(/^[A-Za-z0-9_-]{6}$/);
    expect(room.accessMode).toBe(ROOM_ACCESS_MODES.APPROVAL);
    expect(room.viewerDrawingEnabled).toBe(true);
  });

  it("creates open rooms and can change access mode", () => {
    const store = new RoomStore();
    const room = store.createRoom(ROOM_ACCESS_MODES.OPEN);
    expect(room.accessMode).toBe(ROOM_ACCESS_MODES.OPEN);

    store.setAccessMode(room.id, ROOM_ACCESS_MODES.APPROVAL);
    expect(store.getState(room.id).accessMode).toBe(ROOM_ACCESS_MODES.APPROVAL);
  });

  it("tracks host and viewers without exposing socket ids as participant ids", () => {
    const store = new RoomStore();
    const room = store.createRoom();

    store.joinHost(room.id, "socket-host");
    const { requestId } = store.requestViewerJoin(room.id, "socket-viewer", "Nani");
    expect(store.getState(room.id).viewerCount).toBe(0);

    const { viewerId } = store.approveViewer(room.id, requestId);

    expect(viewerId).not.toBe("socket-viewer");
    expect(store.getHostSocketId(room.id)).toBe("socket-host");
    expect(store.getViewerSocketId(room.id, viewerId)).toBe("socket-viewer");
    expect(store.getViewer(room.id, viewerId)?.displayName).toBe("Nani");
    expect(store.getState(room.id, viewerId)).toMatchObject({
      state: ROOM_STATES.WAITING_FOR_HOST,
      viewerCount: 1,
      selfId: viewerId
    });
  });

  it("updates sharing states", () => {
    const store = new RoomStore();
    const room = store.createRoom();
    store.joinHost(room.id, "socket-host");

    store.markSharing(room.id, true);
    expect(store.getState(room.id).state).toBe(ROOM_STATES.HOST_SHARING);

    store.markSharing(room.id, false);
    expect(store.getState(room.id).state).toBe(ROOM_STATES.HOST_STOPPED);
  });

  it("changes viewer drawing permission", () => {
    const store = new RoomStore();
    const room = store.createRoom();

    store.setViewerDrawingEnabled(room.id, false);

    expect(store.getState(room.id).viewerDrawingEnabled).toBe(false);
  });

  it("cleans up disconnected sockets and inactive rooms", () => {
    const store = new RoomStore();
    const room = store.createRoom(ROOM_ACCESS_MODES.APPROVAL, 1000);
    store.joinHost(room.id, "socket-host", 1000);
    const { requestId } = store.requestViewerJoin(room.id, "socket-viewer", "Nani", 1000);
    const { viewerId } = store.approveViewer(room.id, requestId, 1000);

    const viewerMembership = store.leaveBySocket("socket-viewer", 2000);
    expect(viewerMembership?.participantId).toBe(viewerId);
    expect(store.getState(room.id).viewerCount).toBe(0);

    expect(store.cleanupInactiveRooms(1000, 3000)).toEqual([room.id]);
    expect(store.getRoom(room.id)).toBeUndefined();
  });

  it("persists rooms and restores durable settings without stale socket members", async () => {
    const persistence = new FakeRoomPersistence();
    const store = new RoomStore(persistence, 60_000);
    const room = store.createRoom(ROOM_ACCESS_MODES.OPEN, 1000);
    store.joinHost(room.id, "socket-host", 1100);
    const { requestId } = store.requestViewerJoin(room.id, "socket-viewer", "Nani", 1200);
    store.approveViewer(room.id, requestId, 1300);
    store.setViewerDrawingEnabled(room.id, false, 1400);
    store.markSharing(room.id, true, 1500);
    await store.flushPersistence();

    const restoredStore = new RoomStore(persistence, 60_000);
    await restoredStore.initialize(2000);
    const restoredRoom = restoredStore.getRoom(room.id);

    expect(restoredRoom).toMatchObject({
      accessMode: ROOM_ACCESS_MODES.OPEN,
      viewerDrawingEnabled: false,
      hostSocketId: null,
      isSharing: false,
      wasSharing: true
    });
    expect(restoredRoom?.viewers.size).toBe(0);
    expect(restoredRoom?.pendingViewers.size).toBe(0);
    expect(restoredStore.getState(room.id).state).toBe(ROOM_STATES.HOST_DISCONNECTED);
  });
});

class FakeRoomPersistence implements RoomPersistence {
  readonly rooms = new Map<string, PersistedRoom>();

  async loadRooms(): Promise<PersistedRoom[]> {
    return Array.from(this.rooms.values());
  }

  async saveRoom(room: PersistedRoom): Promise<void> {
    this.rooms.set(room.id, structuredClone(room));
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.rooms.delete(roomId);
  }
}
