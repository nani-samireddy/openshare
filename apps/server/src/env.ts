import "dotenv/config";
import { DEFAULT_CLIENT_ORIGIN, DEFAULT_ICE_SERVERS, DEFAULT_ROOM_TTL_MINUTES } from "@openshare/shared";

export type ServerEnv = {
  port: number;
  clientOrigins: string[];
  iceServers: RTCIceServer[];
  roomTtlMinutes: number;
};

function normalizeOrigin(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseClientOrigins(value: string | undefined): string[] {
  const origins = (value ?? DEFAULT_CLIENT_ORIGIN)
    .split(",")
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean);

  return origins.length > 0 ? origins : [DEFAULT_CLIENT_ORIGIN];
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 4000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("ROOM_TTL_MINUTES must be a positive number");
  }
  return parsed;
}

function parseIceServers(): RTCIceServer[] {
  const turnUrl = process.env.TURN_URL?.trim();
  if (!turnUrl) {
    return DEFAULT_ICE_SERVERS;
  }

  return [
    ...DEFAULT_ICE_SERVERS,
    {
      urls: turnUrl,
      username: process.env.TURN_USERNAME || undefined,
      credential: process.env.TURN_PASSWORD || undefined
    }
  ];
}

export function loadEnv(): ServerEnv {
  return {
    port: parsePort(process.env.PORT),
    clientOrigins: parseClientOrigins(process.env.CLIENT_ORIGIN),
    iceServers: parseIceServers(),
    roomTtlMinutes: parsePositiveNumber(process.env.ROOM_TTL_MINUTES, DEFAULT_ROOM_TTL_MINUTES)
  };
}
