import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ROOM_STATES } from "@openshare/shared";
import { RoomStatus } from "../components/RoomStatus";

describe("RoomStatus", () => {
  it("renders waiting copy for viewers", () => {
    render(<RoomStatus state={ROOM_STATES.WAITING_FOR_HOST} role="viewer" />);
    expect(screen.getByText("Waiting for the host to start sharing...")).toBeInTheDocument();
  });

  it("renders stopped copy", () => {
    render(<RoomStatus state={ROOM_STATES.HOST_STOPPED} role="viewer" />);
    expect(screen.getByText("The host has stopped sharing.")).toBeInTheDocument();
  });
});
