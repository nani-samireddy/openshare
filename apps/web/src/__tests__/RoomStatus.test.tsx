import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ROOM_STATES } from "@openshare/shared";
import { RoomStatus } from "../components/RoomStatus";

describe("RoomStatus", () => {
  it("renders waiting copy for viewers", () => {
    render(<RoomStatus state={ROOM_STATES.WAITING_FOR_HOST} role="viewer" />);
    expect(screen.getByText("Waiting for Host to start sharing...")).toBeInTheDocument();
  });

  it("renders stopped copy", () => {
    render(<RoomStatus state={ROOM_STATES.HOST_STOPPED} role="viewer" />);
    expect(screen.getByText("Host has stopped sharing.")).toBeInTheDocument();
  });

  it("shows the active presenter", () => {
    render(<RoomStatus state={ROOM_STATES.HOST_SHARING} role="viewer" presenterName="Nani" />);
    expect(screen.getByText("Nani is sharing.")).toBeInTheDocument();
  });
});
