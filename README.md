# Annam (अन्नम्)

A MERN food-delivery platform built around three ideas that ordinary delivery apps don't cover:

- **Food reels** — restaurants post short cooking videos, so discovery is a feed you scroll rather than a grid of static photos.
- **Kitchen transparency** — a restaurant goes live on YouTube from a phone in its kitchen and pastes the link; customers watch the feed on the restaurant page before ordering, so hygiene is something you check rather than hope for.
- **Annadevta** — restaurants post surplus food at closing time instead of binning it; nearby volunteers claim a pickup and get it to people who need it.

Five roles share one system: **customer**, **restaurant**, **delivery partner**, **Annadevta volunteer**, and **admin**.

---

## Run it

Requires **Node 20+**. Nothing else — no database install, no API keys.

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**.

The API starts on port 5000 and, with no `MONGODB_URI` set, boots an **in-memory MongoDB** and seeds it automatically. That makes the first run zero-setup; it also means data resets every time the server restarts.

### Demo accounts

Every account uses the password **`Test@123`**. The login page lists them all and fills the form when you click one.

| Role | Email | Lands on |
| --- | --- | --- |
| Customer | `customer@annam.dev` | Discover feed |
| Restaurant | `restaurant@annam.dev` | My Kitchen dashboard |
| Delivery partner | `delivery@annam.dev` | Deliveries dashboard |
| Volunteer | `volunteer@annam.dev` | Annadevta |
| Admin | `admin@annam.dev` | Admin dashboard |

Two more restaurant owners (`restaurant2@`, `restaurant3@`) own the other seeded kitchens.

### Seeing live tracking without three browsers

Real-time delivery needs a customer, a kitchen and a courier acting at once. Rather than juggling three logins, place an order as the customer, copy the id from the tracking URL (`/order/<id>`), and run:

```bash
node scripts/demo-delivery.mjs <orderId>
```

That accepts the order, cooks it, marks it ready, claims it as the courier, reads the pickup OTP, and streams GPS along a route in Bengaluru. Watch the customer's tracking page update as it runs.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API (5000) + Vite dev server (5173) together |
| `npm run dev:server` / `npm run dev:client` | One side only |
| `npm test` | Backend test suite (Jest + Supertest, 101 tests) |
| `npm run lint` | ESLint over server, client and scripts |
| `npm run build` | Production build of the client |
| `npm run seed` | Wipe and reseed the database |
| `npm start` | Run the API without the dev client |

---

## Architecture

```
client/                 React 18 + Vite + Tailwind v4
  src/components/       Navbar, reels player/viewer, map, shared UI
  src/context/          Auth, Cart, Toast (Context API — no Redux)
  src/hooks/useApi.js   useFetch: path is the cache key
  src/pages/            One file per route
  src/services/         axios instance + shared socket

server/                 Node + Express + Mongoose (ESM)
  src/config/           env, database, media storage
  src/models/           User, Restaurant, FoodItem, Order, Donation, Reel, Payment
  src/middleware/       auth (JWT + roles), validation, sanitising, uploads
  src/controllers/      Request handling and business rules
  src/routes/           Route tables with per-route validators
  src/sockets/          Socket.IO auth, order rooms, GPS relay
  src/seed/             Demo dataset
  seed-media/reels/     Reel clips that ship with the repo
  tests/                Jest + Supertest integration tests

scripts/                demo-delivery.mjs, build-seed-reels.mjs
```

The client talks to the API through Vite's dev proxy (`/api`, `/uploads`, `/seed-media`, `/socket.io`), so there is no CORS dance in development and no API URL to configure.

### Data model

`User` carries the role (`customer` / `restaurant` / `delivery` / `volunteer` / `admin`), so one account model covers everyone. A `Restaurant` belongs to one owner and has many `FoodItem`s and `Reel`s. An `Order` links a customer, a restaurant and (once claimed) a delivery partner. A `Donation` is posted by a restaurant and claimed by a volunteer. Restaurant and donation locations are GeoJSON points with `2dsphere` indexes, so "near me" queries are real geo queries.

### Order lifecycle

```
Placed → Accepted → Preparing → Ready → OutForDelivery → Delivered
   └──────────── Cancelled ────────────┘
```

Transitions are enforced server-side in two dimensions: **which role** may set a status, and **which status** may follow the current one. A restaurant cannot jump `Placed → Ready`, a customer cannot accept their own order, and moving to `OutForDelivery` requires the 4-digit pickup OTP that only the customer can read. Couriers claim orders atomically, so two partners tapping "claim" cannot both win.

### Real-time

Socket.IO shares the JWT with the REST API. Clients join a room per order (`order:<id>`) after the server verifies they are actually party to it. Status changes broadcast to that room; couriers emit `locationUpdate`, which the server relays only if the sender is the assigned partner for that order. Volunteers also get a global feed of new donations, so the Annadevta list updates without a refresh.

---

## Configuration

Both `.env` files are created from their `.env.example` on first checkout; every value is optional for local development.

**`server/.env`**

| Variable | Effect when unset |
| --- | --- |
| `MONGODB_URI` | Starts an in-memory MongoDB and seeds it. Set it to a MongoDB Atlas URI for persistence. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Online payment is hidden and checkout offers cash on delivery plus a simulated card. Set both (test keys are free) to enable real payments. |
| `RAZORPAY_WEBHOOK_SECRET` | The webhook is rejected. Set it if you configure the Razorpay webhook. |
| `CLOUDINARY_*` | Uploads are written to `server/uploads/` and served from `/uploads`. Set all three to use Cloudinary. |
| `JWT_SECRET` | Falls back to a development secret. The server **refuses to start in production** with that default. |
| `PORT`, `CLIENT_URL` | Default to 5000 and `http://localhost:5173`. |

**`client/.env`** — leave `VITE_API_URL` empty for local dev (the proxy handles it); set it to the deployed API origin in production.

### Maps

Maps use **Leaflet with OpenStreetMap tiles**, which need no API key and no billing account, so tracking works out of the box. `VITE_GOOGLE_MAPS_API_KEY` is reserved for swapping in Google Maps later; nothing reads it today.

### Payments

Checkout offers **cash on delivery** always, and **online payment via Razorpay** (UPI, card, netbanking) once `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set. Without keys it falls back to a simulated card so the demo still completes end to end.

Get free test keys from the [Razorpay dashboard](https://dashboard.razorpay.com/app/website-app-settings/api-keys) (Test Mode), put them in `server/.env`, and restart. Razorpay publishes [test card numbers](https://razorpay.com/docs/payments/payments/test-card-details/) for trying the flow; in test mode no money moves.

How the flow is put together:

1. The server prices the basket from the database and opens a Razorpay order. **No Annam order exists yet**, so an abandoned payment never reaches a kitchen.
2. The customer pays in Razorpay's own window. Card and UPI details never touch Annam's servers.
3. Razorpay returns a signature. The server verifies it with HMAC-SHA256 against the key secret, and **only then** creates the order as paid. A forged callback creates nothing.
4. A `payment.captured` webhook does the same job server-to-server, covering the case where the customer closes the browser the instant after paying.

Both paths are idempotent — a replay, or the webhook arriving after the browser callback, returns the existing order rather than placing a second one. To receive webhooks locally, expose port 5000 with a tunnel and point the Razorpay webhook at `<public-url>/api/payments/webhook`.

### Kitchen transparency

A restaurant enables transparency in **My Kitchen → Profile** and pastes a stream link. Running our own WebRTC/RTMP ingest would mean operating transcoding and a CDN; YouTube Live already does that for free and a restaurant can go live from the phone already in its kitchen, so a pasted YouTube link is the practical path.

`watch?v=`, `youtu.be/`, `/live/`, `/embed/` and `/shorts/` links all work, as do direct `.mp4`/`.m3u8` URLs for anyone with their own camera feed. The link is parsed server-side (`server/src/utils/streamUrl.js`) and the API hands the client a ready-to-use embed URL, so the browser never has to guess. Unplayable links are rejected on save, and the dashboard previews the embed before you commit to it. Embeds use `youtube-nocookie.com` with related videos switched off.

### Media

The seeded reel clips in `server/seed-media/reels/` are rendered locally by `scripts/build-seed-reels.mjs` (a slow push-in over each dish photo). Public stock-video hosts block hotlinking, so shipping the clips is what makes reels actually play offline. Regenerate them with `node scripts/build-seed-reels.mjs` (needs ffmpeg); you only need this if you change the demo content.

---

## Security

- **Passwords** are bcrypt-hashed and the hash is `select: false`, so it never leaves the database by accident.
- **JWT** carries user id and role; every protected route re-loads the user, so a suspended account loses access immediately rather than at token expiry.
- **Authorisation is per-resource, not just per-role** — owning a restaurant account is not enough to edit *another* restaurant's menu, and only parties to an order can read it.
- **Prices come from the database.** A client that posts its own `price` is ignored.
- **NoSQL injection** is blocked by stripping `$`-prefixed and dotted keys from request payloads.
- **Rate limiting** — 20/min on auth routes, 300/min globally.
- **Helmet** for security headers, **CORS** restricted to the configured client origin, **express-validator** on every write route.
- **Account enumeration** is avoided: a wrong password and an unknown email return the same error.
- Admin accounts cannot be created through public registration, and admins cannot suspend each other.

---

## Testing

```bash
npm test
```

101 tests run the real Express app against a throwaway in-memory MongoDB — auth and account rules, the full order lifecycle including OTP handover and race conditions, the donation lifecycle and volunteer impact counters, ownership boundaries, admin controls, and the payment paths — signature verification, forged callbacks, replay protection and webhook handling.

---

## Deployment

The client is a static build (`npm run build` → `client/dist`) suited to Vercel or Netlify. The server is a long-lived Node process — it holds WebSocket connections, so it needs a real host such as Render or Railway rather than a serverless function.

For production you must set `MONGODB_URI` (MongoDB Atlas), a strong `JWT_SECRET`, and `CLIENT_URL` to the deployed frontend origin. Set `VITE_API_URL` on the client to the deployed API origin. If you want media to survive redeploys, set the Cloudinary variables — most hosts have ephemeral disks, so the local `uploads/` fallback will not persist.

`.github/workflows/ci.yml` lints, tests and builds on every push and pull request.

---

## Known limits

This is a working MVP, not a production service. Specifically:

- **Payments run in Razorpay test mode** unless you supply live keys. There is no refund flow, no partial capture, and no settlement reporting — a real deployment needs those plus a Razorpay account that has cleared KYC.
- **Kitchen transparency rides on YouTube Live**, not our own streaming stack. That is a deliberate trade: it is free and works today, but the stream lives on YouTube's terms — it is public to anyone with the link, and there is no in-app recording or retention.
- **Delivery addresses are not geocoded.** Checkout attaches a fixed demo coordinate in Bengaluru rather than resolving the typed address.
- **Notifications are in-app only** — no email or push.
- **Reels have no moderation queue**, only an admin flag that hides a reel from the public feed.
