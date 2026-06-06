const HOST_TOKEN_PREFIX = "openshare:host:";

export function saveHostToken(roomId: string, hostToken: string): void {
  window.localStorage.setItem(`${HOST_TOKEN_PREFIX}${roomId}`, hostToken);
}

export function getHostToken(roomId: string): string {
  return window.localStorage.getItem(`${HOST_TOKEN_PREFIX}${roomId}`) ?? "";
}
