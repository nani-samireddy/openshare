import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";
import { getVideoContentRect } from "../components/AnnotationCanvas";
import { ScreenVideo } from "../components/ScreenVideo";

const socket = {
  id: "socket",
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
} as unknown as Socket;

describe("ScreenVideo", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: true
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null
    });
  });

  it("requests fullscreen for the video frame", () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLDivElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen
    });

    render(
      <ScreenVideo
        stream={null}
        label="Waiting for the host to start sharing..."
        socket={socket}
        roomId="ABC123"
        isSharing={false}
        canDraw
        isHost
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("aligns annotations to letterboxed video content", () => {
    const video = { videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;
    const content = getVideoContentRect(1000, 600, video);

    expect(content.x).toBeCloseTo(0);
    expect(content.y).toBeCloseTo(18.75);
    expect(content.width).toBeCloseTo(1000);
    expect(content.height).toBeCloseTo(562.5);
  });
});
