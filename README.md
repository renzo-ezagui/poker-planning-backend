# poker-planning-backend

Realtime NestJS/Socket.IO backend for Poker Planning — admin auth, room
management, and the WebSocket gateway that drives voting.

## Local development

1. Copy `.env.example` to `.env` (defaults already work standalone).
2. `docker compose up --build`
3. `curl http://localhost:3000/health` should return `{"ok":true}`.

To run against a local `poker-planning-frontend` checkout too, just start
both — the frontend's default `VITE_API_URL`/`VITE_SOCKET_URL` already point
at `http://localhost:3000`.

## Running tests

`npm test`

## Self-hosting

Set `MONGO_URI`, a strong `JWT_SECRET`, and `ALLOWED_ORIGIN` (your deployed
frontend's origin) as real environment variables — do not reuse the `.env.example`
defaults in production. Put a TLS-terminating reverse proxy in front of this
service; it is not included here.

## Contributing

PRs welcome. CI runs `npm audit` and the test suite on every PR.
