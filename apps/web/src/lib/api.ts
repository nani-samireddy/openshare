import type { CreateRoomResponse } from "@openshare/shared";
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
