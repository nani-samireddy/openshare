import { DEFAULT_SIGNALING_URL } from "@openshare/shared";

export function getSignalingUrl(): string {
  return import.meta.env.VITE_SIGNALING_URL || DEFAULT_SIGNALING_URL;
}
