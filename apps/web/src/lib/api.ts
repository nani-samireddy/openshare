import type { CreateRoomResponse, PublicConfigResponse } from "@openshare/shared";
import { getSignalingUrl } from "./config";

export async function createRoom(): Promise<CreateRoomResponse> {
  const response = await fetch(`${getSignalingUrl()}/rooms`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error("Unable to create a room. Please try again.");
  }

  return (await response.json()) as CreateRoomResponse;
}

export async function getPublicConfig(): Promise<PublicConfigResponse> {
  const response = await fetch(`${getSignalingUrl()}/config`);

  if (!response.ok) {
    throw new Error("Unable to load connection config.");
  }

  return (await response.json()) as PublicConfigResponse;
}
