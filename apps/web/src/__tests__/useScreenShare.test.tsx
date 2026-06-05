import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useScreenShare } from "../hooks/useScreenShare";

describe("useScreenShare", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports unsupported browsers", () => {
    vi.stubGlobal("navigator", {});
    const { result } = renderHook(() => useScreenShare());

    expect(result.current.isSupported).toBe(false);
    expect(result.current.error).toContain("does not support screen sharing");
  });

  it("stops tracks when sharing stops", async () => {
    const stop = vi.fn();
    const addEventListener = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
      getVideoTracks: () => [{ addEventListener }]
    } as unknown as MediaStream;

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(stream)
      }
    });

    const { result } = renderHook(() => useScreenShare());

    await act(async () => {
      await result.current.startSharing();
    });
    act(() => {
      result.current.stopSharing();
    });

    expect(stop).toHaveBeenCalled();
  });
});
