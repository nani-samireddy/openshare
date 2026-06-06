# OpenShare

OpenShare is a free, open-source browser screen-sharing MVP. A host creates a room, shares the room link, and viewers can watch the host's screen from the browser without accounts, extensions, or app installs.

The backend only manages rooms and relays WebRTC signaling. Screen media flows directly between browsers through peer-to-peer WebRTC.

Rooms can require host approval or run in open mode. Open rooms still require viewer display names but admit viewers automatically. Hosts can change the access mode live and approve or deny all pending requests at once.

Hosts and approved viewers can draw temporary annotations over the shared screen. The host can disable viewer drawing or clear all annotations, and completed strokes fade after five seconds.

Rooms can also use passwords, live locking, viewer limits, reusable links, and host-controlled viewer removal. A private host token is saved in the creating browser and is never included in viewer invite links.

Approved participants can use temporary room chat, quick reactions, and raise hand. Hosts can disable chat or reactions live and manage the raised-hand queue. Messages and reactions are relayed through Socket.IO and are not stored.

## Stack

- React, Vite, TypeScript, TailwindCSS
- Fastify, Socket.IO, TypeScript
- pnpm workspaces
- Upstash Redis room persistence with an in-memory fallback for local development

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
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
VITE_SIGNALING_URL=http://localhost:4000
TURN_URL=
TURN_USERNAME=
TURN_PASSWORD=
```

`CLIENT_ORIGIN` must match the deployed web origin for CORS and Socket.IO. Use a comma-separated list when you need both production and preview origins. `VITE_SIGNALING_URL` must point the web app at the deployed server.

TURN settings are optional. When `TURN_URL` is set, the server exposes it through `GET /config` and clients use it in `RTCPeerConnection` alongside the default STUN server.

Upstash Redis is optional locally and recommended in production. Create an Upstash Redis database, copy the REST URL and standard REST token, and set both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` on the server. Never expose the standard token through the frontend or a `VITE_` environment variable.

Redis stores room existence, access mode, annotation permission, and inactivity timestamps. Live Socket.IO memberships remain process-local because browser socket IDs do not survive restarts. After a server restart, saved rooms remain available, but hosts and viewers reconnect as new participants.

Reusable rooms remain available when the host explicitly leaves, until their inactivity TTL expires. One-time rooms are deleted when the host uses `Leave room`. Passwords and private host tokens are stored only as salted hashes.

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

On Render, add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to the server service environment, then redeploy. The server automatically uses Redis when both are present and falls back to memory when neither is set.

The MVP uses direct P2P WebRTC with a public Google STUN server. This is simple and cheap, but it will not connect reliably across every network. Add a TURN server such as coturn for better reliability, a Socket.IO Redis adapter for multi-instance event delivery, and an SFU such as LiveKit or mediasoup before supporting larger rooms.

## MVP Limitations

- No user accounts or cross-device host-token recovery
- No long-term room history or user accounts
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
6. Draw from both browsers and confirm annotations appear on the other screen.
7. Disable viewer drawing and confirm only the host can annotate.
8. Stop sharing and confirm viewers see the stopped state.
