import { Eraser, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ANNOTATION_COLORS,
  ANNOTATION_FADE_MS,
  ANNOTATION_MAX_POINTS_PER_SEGMENT,
  SOCKET_EVENTS,
  type AnnotationColor,
  type AnnotationPoint,
  type AnnotationStrokePayload
} from "@openshare/shared";
import type { Socket } from "socket.io-client";

type Stroke = {
  id: string;
  color: AnnotationColor;
  points: AnnotationPoint[];
  complete: boolean;
};

type AnnotationCanvasProps = {
  socket: Socket;
  roomId: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isSharing: boolean;
  canDraw: boolean;
  isHost: boolean;
};

export function AnnotationCanvas({ socket, roomId, containerRef, videoRef, isSharing, canDraw, isHost }: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef(new Map<string, Stroke>());
  const activeStrokeIdRef = useRef<string | null>(null);
  const pendingPointsRef = useRef<AnnotationPoint[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const fadeTimersRef = useRef(new Map<string, number>());
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [color, setColor] = useState<AnnotationColor>(ANNOTATION_COLORS[0]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const bounds = container.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    const content = getVideoContentRect(bounds.width, bounds.height, videoRef.current);

    for (const stroke of strokesRef.current.values()) {
      if (stroke.points.length === 0) {
        continue;
      }

      context.beginPath();
      context.strokeStyle = stroke.color;
      context.lineWidth = 4;
      context.lineCap = "round";
      context.lineJoin = "round";
      stroke.points.forEach((point, index) => {
        const x = content.x + point.x * content.width;
        const y = content.y + point.y * content.height;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.stroke();
    }
  }, [containerRef, videoRef]);

  const removeStrokeLater = useCallback(
    (strokeId: string) => {
      const currentTimer = fadeTimersRef.current.get(strokeId);
      if (currentTimer) {
        window.clearTimeout(currentTimer);
      }

      const timer = window.setTimeout(() => {
        strokesRef.current.delete(strokeId);
        fadeTimersRef.current.delete(strokeId);
        redraw();
      }, ANNOTATION_FADE_MS);
      fadeTimersRef.current.set(strokeId, timer);
    },
    [redraw]
  );

  const clearAll = useCallback(() => {
    strokesRef.current.clear();
    for (const timer of fadeTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    fadeTimersRef.current.clear();
    redraw();
  }, [redraw]);

  const flushPending = useCallback(
    (complete = false) => {
      const strokeId = activeStrokeIdRef.current;
      if (!strokeId) {
        return;
      }

      const points = pendingPointsRef.current.splice(0, ANNOTATION_MAX_POINTS_PER_SEGMENT);
      if (points.length > 0) {
        socket.emit(SOCKET_EVENTS.ANNOTATION_STROKE, { roomId, strokeId, color, points, complete } satisfies AnnotationStrokePayload);
      } else if (complete) {
        const stroke = strokesRef.current.get(strokeId);
        const lastPoint = stroke?.points.at(-1);
        if (lastPoint) {
          socket.emit(SOCKET_EVENTS.ANNOTATION_STROKE, {
            roomId,
            strokeId,
            color,
            points: [lastPoint],
            complete: true
          } satisfies AnnotationStrokePayload);
        }
      }

      if (pendingPointsRef.current.length > 0) {
        animationFrameRef.current = window.requestAnimationFrame(() => flushPending(complete));
      } else {
        animationFrameRef.current = null;
      }
    },
    [color, roomId, socket]
  );

  function queueFlush() {
    if (animationFrameRef.current === null) {
      animationFrameRef.current = window.requestAnimationFrame(() => flushPending(false));
    }
  }

  function normalizedPoint(event: React.PointerEvent<HTMLCanvasElement>): AnnotationPoint | null {
    const container = containerRef.current;
    if (!container) {
      return null;
    }

    const bounds = container.getBoundingClientRect();
    const content = getVideoContentRect(bounds.width, bounds.height, videoRef.current);
    const x = event.clientX - bounds.left - content.x;
    const y = event.clientY - bounds.top - content.y;
    if (x < 0 || y < 0 || x > content.width || y > content.height) {
      return null;
    }

    return { x: x / content.width, y: y / content.height };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingEnabled || !canDraw || !isSharing) {
      return;
    }

    const point = normalizedPoint(event);
    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const strokeId = `${socket.id ?? "local"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeStrokeIdRef.current = strokeId;
    pendingPointsRef.current = [point];
    strokesRef.current.set(strokeId, { id: strokeId, color, points: [point], complete: false });
    redraw();
    queueFlush();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const strokeId = activeStrokeIdRef.current;
    if (!strokeId || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    const point = normalizedPoint(event);
    const stroke = strokesRef.current.get(strokeId);
    if (!point || !stroke) {
      return;
    }

    stroke.points.push(point);
    pendingPointsRef.current.push(point);
    redraw();
    queueFlush();
  }

  function finishStroke() {
    const strokeId = activeStrokeIdRef.current;
    if (!strokeId) {
      return;
    }

    const stroke = strokesRef.current.get(strokeId);
    if (stroke) {
      stroke.complete = true;
    }
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    flushPending(true);
    removeStrokeLater(strokeId);
    activeStrokeIdRef.current = null;
  }

  useEffect(() => {
    function handleStroke(payload: AnnotationStrokePayload) {
      if (payload.roomId !== roomId) {
        return;
      }

      const existing = strokesRef.current.get(payload.strokeId);
      if (existing) {
        existing.points.push(...payload.points);
        existing.complete = payload.complete;
      } else {
        strokesRef.current.set(payload.strokeId, {
          id: payload.strokeId,
          color: payload.color,
          points: [...payload.points],
          complete: payload.complete
        });
      }

      if (payload.complete) {
        removeStrokeLater(payload.strokeId);
      }
      redraw();
    }

    socket.on(SOCKET_EVENTS.ANNOTATION_STROKE, handleStroke);
    socket.on(SOCKET_EVENTS.ANNOTATION_CLEAR, clearAll);
    socket.on(SOCKET_EVENTS.PRESENTER_STOPPED_SHARING, clearAll);
    return () => {
      socket.off(SOCKET_EVENTS.ANNOTATION_STROKE, handleStroke);
      socket.off(SOCKET_EVENTS.ANNOTATION_CLEAR, clearAll);
      socket.off(SOCKET_EVENTS.PRESENTER_STOPPED_SHARING, clearAll);
    };
  }, [clearAll, redraw, removeStrokeLater, roomId, socket]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(redraw);
    observer.observe(container);
    videoRef.current?.addEventListener("loadedmetadata", redraw);
    redraw();
    return () => {
      observer.disconnect();
      videoRef.current?.removeEventListener("loadedmetadata", redraw);
    };
  }, [containerRef, redraw, videoRef]);

  useEffect(() => {
    if (!canDraw || !isSharing) {
      setDrawingEnabled(false);
    }
    if (!isSharing) {
      clearAll();
    }
  }, [canDraw, clearAll, isSharing]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      for (const timer of fadeTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
    },
    []
  );

  function handleClear() {
    socket.emit(SOCKET_EVENTS.ANNOTATION_CLEAR, { roomId });
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label="Screen annotation canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        className={`absolute inset-0 h-full w-full touch-none ${drawingEnabled && canDraw && isSharing ? "cursor-crosshair" : "pointer-events-none"}`}
      />
      {isSharing ? (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border-2 border-ink bg-cream p-2 shadow-[3px_3px_0_#26304f]">
          <button
            type="button"
            aria-label={drawingEnabled ? "Stop drawing" : "Draw on screen"}
            title={drawingEnabled ? "Stop drawing" : "Draw on screen"}
            disabled={!canDraw}
            onClick={() => setDrawingEnabled((current) => !current)}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink disabled:opacity-50 ${
              drawingEnabled ? "bg-sun" : "bg-white"
            }`}
          >
            <Pencil aria-hidden className="h-4 w-4" />
          </button>
          {ANNOTATION_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Use ${swatch} annotation color`}
              title={swatch}
              onClick={() => setColor(swatch)}
              className={`h-7 w-7 rounded-full border-2 border-ink ${color === swatch ? "ring-2 ring-cream ring-offset-2 ring-offset-ink" : ""}`}
              style={{ backgroundColor: swatch }}
            />
          ))}
          {isHost ? (
            <button
              type="button"
              aria-label="Clear annotations"
              title="Clear annotations"
              onClick={handleClear}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink bg-coral"
            >
              <Eraser aria-hidden className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function getVideoContentRect(containerWidth: number, containerHeight: number, video: HTMLVideoElement | null) {
  const videoWidth = video?.videoWidth || containerWidth;
  const videoHeight = video?.videoHeight || containerHeight;
  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height
  };
}
