import { useCallback, useEffect, useMemo, useState } from "react";

type ScreenShareState = {
  stream: MediaStream | null;
  isStarting: boolean;
  error: string | null;
  isSupported: boolean;
  startSharing: () => Promise<MediaStream | null>;
  stopSharing: () => void;
};

export function useScreenShare(): ScreenShareState {
  const isSupported = useMemo(() => Boolean(navigator.mediaDevices?.getDisplayMedia), []);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(
    isSupported ? null : "Your browser does not support screen sharing. Please try the latest version of Chrome, Edge, or Firefox."
  );

  const stopSharing = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

  const startSharing = useCallback(async () => {
    if (!isSupported) {
      setError("Your browser does not support screen sharing. Please try the latest version of Chrome, Edge, or Firefox.");
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
