import { describe, expect, it } from "vitest";
import { ROOM_STATES, isValidRoomId } from "../index.js";

describe("shared constants", () => {
  it("validates URL-safe room ids", () => {
    expect(isValidRoomId("a8f4k2")).toBe(true);
    expect(isValidRoomId("abc_12-Z")).toBe(true);
    expect(isValidRoomId("short")).toBe(false);
    expect(isValidRoomId("room with spaces")).toBe(false);
  });

  it("exposes MVP room states", () => {
    expect(Object.values(ROOM_STATES)).toEqual([
      "waiting_for_host",
      "host_sharing",
      "host_stopped",
      "host_disconnected"
    ]);
  });
});
