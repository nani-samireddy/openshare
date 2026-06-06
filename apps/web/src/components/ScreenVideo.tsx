import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { AnnotationCanvas } from "./AnnotationCanvas";

type ScreenVideoProps = {
  stream: MediaStream | null;
  label: string;
  socket: Socket;
  roomId: string;
  isSharing: boolean;
  canDraw: boolean;
  isHost: boolean;
};

export function ScreenVideo({ stream, label, socket, roomId, isSharing, canDraw, isHost }: ScreenVideoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canUseFullscreen = typeof document !== "undefined" && Boolean(document.fullscreenEnabled);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function handleFullscreen() {
    if (!containerRef.current || !canUseFullscreen) {
      return;
    }

    if (document.fullscreenElement === containerRef.current) {
      await document.exitFullscreen();
      return;
    }

    await containerRef.current.requestFullscreen();
  }

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full overflow-hidden rounded-md border-[3px] border-ink bg-ink shadow-sketch fullscreen:aspect-auto fullscreen:h-screen fullscreen:w-screen fullscreen:rounded-none"
    >
      {stream ? (
        <video
          ref={videoRef}
          aria-label={label}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-ink px-6 text-center text-sm font-bold text-cream">
          <div className="max-w-md rounded-md border-2 border-cream/40 px-4 py-3">{label}</div>
        </div>
      )}
      <AnnotationCanvas
        socket={socket}
        roomId={roomId}
        containerRef={containerRef}
        videoRef={videoRef}
        isSharing={isSharing}
        canDraw={canDraw}
        isHost={isHost}
      />
      {canUseFullscreen ? (
        <button
          type="button"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          onClick={handleFullscreen}
          className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-ink bg-sun text-ink shadow-[3px_3px_0_#26304f] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
        >
          {isFullscreen ? <Minimize2 aria-hidden className="h-5 w-5" /> : <Maximize2 aria-hidden className="h-5 w-5" />}
        </button>
      ) : null}
    </div>
  );
}
