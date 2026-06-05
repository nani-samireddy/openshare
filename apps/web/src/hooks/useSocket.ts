import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getSignalingUrl } from "../lib/config";

export function useSocket(): { socket: Socket; connected: boolean } {
  const socket = useMemo(
    () =>
      io(getSignalingUrl(), {
        autoConnect: true,
        transports: ["websocket", "polling"]
      }),
    []
  );
  const disconnectTimerRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    function handleConnect() {
      setConnected(true);
    }

    function handleDisconnect() {
      setConnected(false);
    }

    if (disconnectTimerRef.current) {
      window.clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    if (socket.connected) {
      setConnected(true);
    } else {
      socket.connect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      disconnectTimerRef.current = window.setTimeout(() => {
        socket.disconnect();
      }, 0);
    };
  }, [socket]);

  return { socket, connected };
}
