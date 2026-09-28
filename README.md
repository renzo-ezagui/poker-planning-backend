# poker-planning-backend

Realtime NestJS + Socket.IO backend for Poker Planning: host accounts, tables
("rooms"), and the WebSocket gateway that runs voting, chat and moderation.

## Local development

1. `docker compose up --build`
2. `curl http://localhost:3000/health` should return `{"ok":true}`.
3. Start [poker-planning-frontend](https://github.com/renzo-ezagui/poker-planning-frontend)
   too. Its defaults already point at `http://localhost:3000`. Create a host
   account from its **Host a table** page.

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017/poker-planning` | Mongo connection string |
| `JWT_SECRET` | — (required) | Signs host session cookies. Use a long random value. |
| `ALLOWED_ORIGIN` | `http://localhost:5173` | Comma-separated frontend origins (CORS + Socket.IO). `*` is rejected. |
| `ALLOW_REGISTRATION` | `false` | `true` lets anyone create a host account (and sign up with Google). |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | Seeds one host account at startup if it doesn't exist (password ≥ 12 chars). |
| `GOOGLE_CLIENT_ID` | — | OAuth 2.0 **Web application** client ID. Enables "Sign in with Google". |
| `COOKIE_SECURE` | `true` | `false` for plain-http setups, `auto` to follow the request scheme behind a TLS proxy. |
| `TRUST_PROXY` | unset | `private` trusts `X-Forwarded-For`/`-Proto` from loopback/private-network proxies. Needed for correct client IPs (bans, rate limits) behind a reverse proxy. |
| `PORT` | `3000` | HTTP port |

### Enabling Google sign-in

1. Google Cloud Console → *APIs & Services* → *Credentials* → *Create credentials* →
   *OAuth client ID* → type **Web application**.
2. Add your frontend's public origin (e.g. `https://poker.example.com`) under
   *Authorized JavaScript origins*. No redirect URI is needed.
3. Set `GOOGLE_CLIENT_ID` to the generated client ID and restart. The sign-in page
   shows the Google button automatically (`GET /auth/config`).

Google only works on `https://` origins (or `http://localhost`).

## HTTP API

| Method & path | Auth | |
|---|---|---|
| `GET /health` | — | liveness |
| `GET /auth/config` | — | `{ registration, googleClientId }` |
| `POST /auth/register` | — | `{ username, password }`. Creates the account and signs in. |
| `POST /auth/login` / `POST /auth/logout` | — | session cookie (`admin_jwt`, httpOnly, SameSite=Strict, 2 h) |
| `POST /auth/google` | — | `{ credential }` from Google Identity Services |
| `GET /auth/me` | host | `{ username }` |
| `POST /rooms` | host | `{ deckType: 'fibonacci'\|'tshirt', expiresInHours: 1–72 }` |
| `GET /rooms/mine` | host | open rooms of this host |
| `GET /rooms/:code` | — | public room view |
| `GET /rooms/:code/is-admin`, `GET /rooms/:code/banned-ips` | host | |

## Socket.IO events

Client → server: `join {roomCode, name, token?, isSpectator?}`, `vote:cast {value}`,
`chat:message {text}`; host-only: `round:start {topic}`, `round:reveal`, `round:revote`,
`timer:start {endsAt}`, `participant:kick|mute|ban {participantId}`,
`participant:unban {ip}`, `room:close` (all with `roomCode`).

Server → client: `joined` (seat, token and full room state), `participant:update`
(roster), `participant:voted`, `round:start|reveal|revote`, `timer:start`,
`chat:message`, `moderation:muted|removed`, `room:close` (CSV export), `error {message, code}`.

Every host-only event is re-checked against the room's owner on the server. Votes
stay on the server until the reveal.

## Running tests

`npm test`

## Self-hosting

Serve the frontend, `/api` and `/socket.io` from one origin behind a
TLS-terminating reverse proxy (set `TRUST_PROXY=private` and `COOKIE_SECURE=auto`),
or keep them on separate origins and list the frontend in `ALLOWED_ORIGIN`. Never
reuse the example secrets in production.

## Contributing

PRs welcome. CI runs `npm audit` and the test suite on every PR.
