# OpenShare

OpenShare is a free, open-source browser screen-sharing MVP. A host creates a room, shares the room link, and viewers can watch the host's screen from the browser without accounts, extensions, or app installs.

The backend only manages rooms and relays WebRTC signaling. Screen media flows directly between browsers through peer-to-peer WebRTC.

## Stack

- React, Vite, TypeScript, TailwindCSS
- Fastify, Socket.IO, TypeScript
- pnpm workspaces
- In-memory room store for the MVP

## Local Development

Install dependencies:

```bash
pnpm install
```

Run the web app and signaling server together:

```bash
pnpm dev
```

Or run them separately:

```bash
pnpm dev:web
pnpm dev:server
```

Default local URLs:

- Web: `http://localhost:5173`
- Server: `http://localhost:4000`
- Health check: `http://localhost:4000/health`
- Public client config: `http://localhost:4000/config`

## Environment

Copy `.env.example` into the environment used by each app and adjust values as needed.

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
ROOM_TTL_MINUTES=30
VITE_SIGNALING_URL=http://localhost:4000
TURN_URL=
TURN_USERNAME=
TURN_PASSWORD=
```

`CLIENT_ORIGIN` must match the deployed web origin for CORS and Socket.IO. Use a comma-separated list when you need both production and preview origins. `VITE_SIGNALING_URL` must point the web app at the deployed server.

TURN settings are optional. When `TURN_URL` is set, the server exposes it through `GET /config` and clients use it in `RTCPeerConnection` alongside the default STUN server.

## Scripts

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

## Deployment Notes

For a free MVP deployment, host `apps/web` on Cloudflare Pages, Vercel, or Netlify, and host `apps/server` on Render, Railway, Fly.io, or a similar Node-capable service.

Production screen capture requires HTTPS. Configure `CLIENT_ORIGIN` on the server to the exact frontend URL, and configure `VITE_SIGNALING_URL` on the frontend to the backend URL.

The MVP uses direct P2P WebRTC with a public Google STUN server. This is simple and cheap, but it will not connect reliably across every network. Add a TURN server such as coturn for better reliability, Redis for multi-instance room state, and an SFU such as LiveKit or mediasoup before supporting larger rooms.

## MVP Limitations

- No authentication
- No database
- No recording
- No chat
- No remote control
- No file sharing
- One host per room
- P2P scaling only

## Acceptance Flow

1. Open the home page and click `Start Sharing`.
2. Copy the room link from the host room.
3. Open the link in another browser or device.
4. Start sharing from the host browser.
5. Confirm the viewer sees the host screen.
6. Stop sharing and confirm viewers see the stopped state.
7.
