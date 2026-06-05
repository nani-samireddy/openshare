import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenVideo } from "../components/ScreenVideo";

describe("ScreenVideo", () => {
  beforeEach(() => {
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

    render(<ScreenVideo stream={null} label="Waiting for the host to start sharing..." />);
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });
});
