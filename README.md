# SocioVerse

Social networking app by Abdul Basit, built with Express, MongoDB and Socket.IO.

## Run locally

1. Install Node.js 22+ and provide a MongoDB server (local or Atlas).
2. In `backend`, run `npm ci`.
3. Copy `.env.example` to `.env` if you do not already have one. Set `MONGO_URI`, `CLIENT_URL` and a random `JWT_SECRET` of at least 32 characters. Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Run `npm start` from `backend`, or `node SocioVerse/backend/server.js` from the project root. The server loads `.env` relative to its own folder.
5. Open http://localhost:5000. The backend serves the frontend and Socket.IO client. Do not open the HTML files directly or use a separate Live Server.

Database connection failures stop startup with a clear error. Verify the connection string, Atlas network access and database credentials if startup fails. A port-in-use error means another process already occupies `PORT`.

## Deploy to Vercel

The repository root deploys as one Vercel project: `frontend/` is served as static files and `api/index.js` runs the Express + Socket.IO backend as a function (see `vercel.json`). Set these project environment variables: `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL` (the deployed origin), `NODE_ENV=production` and, for password-reset email, the SMTP settings. MongoDB Atlas must allow connections from anywhere (`0.0.0.0/0`) because Vercel uses dynamic IPs.

Function instances do not share memory, so socket events and presence are relayed through MongoDB change streams (`@socket.io/mongo-adapter`, collection `socket.io-adapter-events`); this requires a replica set, which Atlas provides. Sockets use the WebSocket transport only and reconnect automatically when a function reaches its 5-minute maximum duration. Vercel limits request bodies to 4.5MB, which sets the upload limits below; JSON responses are streamed so large feeds are not affected.

## Password reset

For real delivery, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`. Port 465 uses TLS; port 587 uses SMTP STARTTLS. Set `CLIENT_URL` to the site's actual origin.

For a **local demonstration only**, set `DEV_EMAIL_PREVIEW=true` with `NODE_ENV=development`. Ethereal test emails are not delivered to real inboxes; the page displays a preview link. Anyone holding that preview can reset the account, so never enable this on a public server. Production never returns preview links. Without SMTP or local preview enabled, the reset request reports that email is not configured.

Password reset and password change revoke existing login tokens and disconnect sockets. Log in again afterward. Authentication endpoints allow 30 attempts per IP per 15 minutes per server process.

## Behavior

- Public, friends-only and only-me posts enforce visibility on the feed and direct actions. Private accounts hide their previous public posts from non-friends too.
- Blocking prevents profile access, post/story interactions and messaging in both directions.
- Stories expire after 24 hours even while MongoDB's TTL cleanup is pending.
- Share links open the actual post after login; only authorized viewers can access it.
- PNG, JPEG, GIF, WebP, MP4, WebM and Ogg uploads are supported. Posts/stories allow 3MB; avatars/covers allow 1.5MB each. These limits keep requests under Vercel's 4.5MB request-body limit (a profile save sends both images) and embedded media below MongoDB's document-size limit.
- Deleting a message or clearing a chat affects only your view.

## Tests

From `backend`, run `npm test`. By default, the integration suite downloads a MongoDB test binary on first use and starts an isolated local database. The Windows binary can be large.

Alternatively, set `TEST_MONGO_URI` to a MongoDB server on which temporary databases are allowed, then run `npm test`. The suite creates a random `socioverse_test_...` database and drops only that database afterward. It never uses the application database name. No SMTP delivery occurs in automated tests.

Tests cover authentication, request validation, error handling, privacy, comment ownership, story expiry, blocking, chat membership/concurrency, socket payloads, reset-token reuse, session revocation, mail configuration, upload safety, rate limits and served frontend assets.

Run `npm audit` to check installed dependencies. See `REVIEW.md` for the verification record and remaining limitations.

## Structure

- `backend/config`: database and email configuration
- `backend/middleware`: authentication, validation, error handling and rate limiting
- `backend/models`: MongoDB schemas
- `backend/routes`: authentication, users, posts, friends, chats, stories and notifications
- `frontend`: HTML, CSS and browser JavaScript

This remains a single-server demonstration app. For larger deployments, use object storage for media, pagination for long histories, a shared rate-limit/presence store, and a Socket.IO adapter. Configure HTTPS and deployment-specific proxy settings before public hosting.
