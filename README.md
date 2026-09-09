# Annam (अन्नम्)

A MERN food-delivery platform built around three ideas that ordinary delivery apps don't cover:

- **Food reels** — restaurants post short cooking videos, so discovery is a feed you scroll rather than a grid of static photos.
- **Kitchen transparency** — participating restaurants can expose a live kitchen feed, so hygiene is something you check before ordering rather than hope for.
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
| `npm test` | Backend test suite (Jest + Supertest, 55 tests) |
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
  src/models/           User, Restaurant, FoodItem, Order, Donation, Reel
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
| `CLOUDINARY_*` | Uploads are written to `server/uploads/` and served from `/uploads`. Set all three to use Cloudinary. |
| `JWT_SECRET` | Falls back to a development secret. The server **refuses to start in production** with that default. |
| `PORT`, `CLIENT_URL` | Default to 5000 and `http://localhost:5173`. |

**`client/.env`** — leave `VITE_API_URL` empty for local dev (the proxy handles it); set it to the deployed API origin in production.

### Maps

Maps use **Leaflet with OpenStreetMap tiles**, which need no API key and no billing account, so tracking works out of the box. `VITE_GOOGLE_MAPS_API_KEY` is reserved for swapping in Google Maps later; nothing reads it today.

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

55 integration tests run the real Express app against a throwaway in-memory MongoDB — auth and account rules, the full order lifecycle including OTP handover and race conditions, the donation lifecycle and volunteer impact counters, ownership boundaries, and admin controls.

---

## Deployment

The client is a static build (`npm run build` → `client/dist`) suited to Vercel or Netlify. The server is a long-lived Node process — it holds WebSocket connections, so it needs a real host such as Render or Railway rather than a serverless function.

For production you must set `MONGODB_URI` (MongoDB Atlas), a strong `JWT_SECRET`, and `CLIENT_URL` to the deployed frontend origin. Set `VITE_API_URL` on the client to the deployed API origin. If you want media to survive redeploys, set the Cloudinary variables — most hosts have ephemeral disks, so the local `uploads/` fallback will not persist.

`.github/workflows/ci.yml` lints, tests and builds on every push and pull request.

---

## Known limits

This is a working MVP, not a production service. Specifically:

- **Payments are simulated.** Choosing "Card" marks the order paid without contacting any gateway, and no card details are collected anywhere.
- **Kitchen transparency is a video URL**, not a streaming stack. A restaurant can point at an MP4/HLS URL; there is no WebRTC/RTMP ingest.
- **Delivery addresses are not geocoded.** Checkout attaches a fixed demo coordinate in Bengaluru rather than resolving the typed address.
- **Notifications are in-app only** — no email or push.
- **Reels have no moderation queue**, only an admin flag that hides a reel from the public feed.
