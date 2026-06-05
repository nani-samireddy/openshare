export const SCREEN_SHARE_UNSUPPORTED_MESSAGE =
  "Hosting screen share is not supported on this browser. Open this room on desktop Chrome, Edge, or Firefox to share. Viewers can still join from mobile.";

export function supportsScreenSharing(): boolean {
  return Boolean(navigator.mediaDevices?.getDisplayMedia);
}
