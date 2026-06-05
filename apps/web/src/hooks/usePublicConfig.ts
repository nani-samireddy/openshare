import { useEffect, useState } from "react";
import { DEFAULT_ICE_SERVERS } from "@openshare/shared";
import { getPublicConfig } from "../lib/api";

type UsePublicConfigResult = {
  iceServers: RTCIceServer[];
  error: string | null;
};

export function usePublicConfig(): UsePublicConfigResult {
  const [iceServers, setIceServers] = useState<RTCIceServer[]>(DEFAULT_ICE_SERVERS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    getPublicConfig()
      .then((config) => {
        if (isCurrent && config.iceServers.length > 0) {
          setIceServers(config.iceServers);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setError("Using default connection servers. Some strict networks may need TURN.");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  return { iceServers, error };
}
