import { describe, expect, it } from "vitest";
import { ROOM_STATES } from "@openshare/shared";
import { RoomStore } from "../rooms/room-store.js";

describe("RoomStore", () => {
  it("creates short URL-safe rooms", () => {
    const store = new RoomStore();
    const room = store.createRoom();
    expect(room.id).toMatch(/^[A-Za-z0-9_-]{6}$/);
  });

  it("tracks host and viewers without exposing socket ids as participant ids", () => {
    const store = new RoomStore();
    const room = store.createRoom();

    store.joinHost(room.id, "socket-host");
    const { viewerId } = store.joinViewer(room.id, "socket-viewer");

    expect(viewerId).not.toBe("socket-viewer");
    expect(store.getHostSocketId(room.id)).toBe("socket-host");
    expect(store.getViewerSocketId(room.id, viewerId)).toBe("socket-viewer");
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

  it("cleans up disconnected sockets and inactive rooms", () => {
    const store = new RoomStore();
    const room = store.createRoom(1000);
    store.joinHost(room.id, "socket-host", 1000);
    const { viewerId } = store.joinViewer(room.id, "socket-viewer", 1000);

    const viewerMembership = store.leaveBySocket("socket-viewer", 2000);
    expect(viewerMembership?.participantId).toBe(viewerId);
    expect(store.getState(room.id).viewerCount).toBe(0);

    expect(store.cleanupInactiveRooms(1000, 3000)).toEqual([room.id]);
    expect(store.getRoom(room.id)).toBeUndefined();
  });
});
