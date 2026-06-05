import "dotenv/config";
import { DEFAULT_CLIENT_ORIGIN, DEFAULT_ROOM_TTL_MINUTES } from "@openshare/shared";

export type ServerEnv = {
  port: number;
  clientOrigin: string;
  roomTtlMinutes: number;
};

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

export function loadEnv(): ServerEnv {
  return {
    port: parsePort(process.env.PORT),
    clientOrigin: process.env.CLIENT_ORIGIN ?? DEFAULT_CLIENT_ORIGIN,
    roomTtlMinutes: parsePositiveNumber(process.env.ROOM_TTL_MINUTES, DEFAULT_ROOM_TTL_MINUTES)
  };
}
