import { useCallback, useEffect, useMemo, useState } from "react";
import { SCREEN_SHARE_UNSUPPORTED_MESSAGE, supportsScreenSharing } from "../lib/screenShareSupport";

type ScreenShareState = {
  stream: MediaStream | null;
  isStarting: boolean;
  error: string | null;
  isSupported: boolean;
  startSharing: () => Promise<MediaStream | null>;
  stopSharing: () => void;
};

export function useScreenShare(): ScreenShareState {
  const isSupported = useMemo(() => supportsScreenSharing(), []);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(isSupported ? null : SCREEN_SHARE_UNSUPPORTED_MESSAGE);

  const stopSharing = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

  const startSharing = useCallback(async () => {
    if (!isSupported) {
      setError(SCREEN_SHARE_UNSUPPORTED_MESSAGE);
      return null;
    }

    setIsStarting(true);
    setError(null);

    try {
      const nextStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });

      for (const track of nextStream.getVideoTracks()) {
        track.addEventListener("ended", stopSharing, { once: true });
      }

      setStream(nextStream);
      return nextStream;
    } catch (caught) {
      const message =
        caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "Screen sharing permission was cancelled."
          : "Unable to start screen sharing.";
      setError(message);
      return null;
    } finally {
      setIsStarting(false);
    }
  }, [isSupported, stopSharing]);

  useEffect(() => stopSharing, [stopSharing]);

  return { stream, isStarting, error, isSupported, startSharing, stopSharing };
}
