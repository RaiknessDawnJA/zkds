# ZKDS — Kitchen Display System

A browser-based Kitchen Display System for a high-volume full-service restaurant,
built in the operational style of the KDS screens used in steakhouse kitchens.

**PostgreSQL, via an Express + WebSocket backend, is the authoritative source of
truth.** BROIL, FRY, SALAD, HOT SIDE, and WINDOW can run as separate browser
tabs — or separate physical devices reachable over the same LAN, VPN, or
private network — and stay synchronized in realtime through one shared
backend. There is still no live POS integration; order data comes from an
explicit seed script that posts through the same POS-neutral ingestion
boundary a future POS adapter will use.

---

## Scope so far

**Steps 1–3** — proved the core architecture: one station end to end (BROIL),
then FRY/SALAD/HOT SIDE and WINDOW/EXPO reusing the same components with zero
new station-screen code, all sharing one in-memory store per browser tab.

**Step 3.5** — a performance audit of the frontend render architecture
(`KitchenTicket`/`KitchenItem` memoization boundaries, verified by measuring
render fan-out on a large stress board, not by assumption).

**Step 4** — Window gained its own real lifecycle: WINDOW BUMP/RECALL,
independent of station BUMP/RECALL. Bumping Window sends an order to Expo's
own recall queue; recalling it there never reopens a station. Window can also
toggle any item directly — the same COMPLETE_ITEM/UNCOMPLETE_ITEM action a
station screen dispatches, against the exact same ticket.

**Step 5** — moved authoritative state off the browser entirely, onto a real
backend: PostgreSQL + Express + WebSocket, one npm workspace monorepo
(`frontend` / `backend` / `shared`). Every mutation is validated and persisted
server-side and broadcast to all connected clients; a browser refresh or a
backend restart no longer loses kitchen state. This included fixing a
regression Phase B testing found: Window now correctly goes read-only on a
BUMPED station's items instead of letting you toggle something the backend
will reject.

Every screen is still written generically against a `Station` union — adding
a station has stayed a small, mechanical change throughout.

## Technology

- TypeScript (strict) across all three workspaces
- **Frontend:** React 19, Next.js 15 (App Router), CSS Modules
- **Backend:** Node.js, Express 5, `ws` (WebSocket, same HTTP server/port),
  Drizzle ORM + `drizzle-kit`, PostgreSQL
- **Shared:** one `@zkds/shared` package holding domain types, pure
  transitions, routing, and the WebSocket event contract — imported
  identically by both frontend and backend
- Vitest across all three workspaces

No authentication, no external API calls, no live POS integration yet.

---

## Install

Requires **Node.js 20.9+** (Node 22 LTS recommended) and a local **PostgreSQL**
instance (any recent version).

From the repo root (this is an npm workspace — one install covers all three
packages):

```bash
npm install
```

Create a database and a `backend/.env` (never committed — copy the example):

```bash
cp backend/.env.example backend/.env
# edit backend/.env: DATABASE_URL, PORT (defaults to 4000)
```

Run migrations, then seed the demo dataset:

```bash
cd backend
npm run db:migrate
npm run seed
```

## Run locally

Two processes, in separate terminals:

```bash
cd backend && npm run dev     # http://localhost:4000 — REST + WebSocket
cd frontend && npm run dev    # http://localhost:3000
```

Then open any of:

```
http://localhost:3000/station/broil
http://localhost:3000/station/fry
http://localhost:3000/station/salad
http://localhost:3000/station/hot-side
http://localhost:3000/station/window
```

The root URL `/` redirects to `/station/broil`. All five routes load their
state from the backend and subscribe to the same WebSocket — bumping a ticket
on any station is immediately visible on `/station/window`, whether that's
another tab or a different device entirely.

### Accessing from another device (phone, tablet, second laptop)

The frontend needs to know where to reach the backend, and by default it
assumes `localhost`, which only works from the machine running it. Set
`frontend/.env.local` (copy `.env.local.example`) to the backend host's real
address:

```
NEXT_PUBLIC_API_URL=http://<your-machine's-LAN-or-VPN-address>:4000
```

`NEXT_PUBLIC_*` values are baked in at Next.js server start, so restart
`npm run dev` in `frontend/` after changing this file.

### Resetting the demo dataset

The seed data ages relative to when it's inserted, so ticket timers look
correct only right after seeding.

```bash
cd backend
npm run reset-demo   # clears all orders, reseeds fresh timestamps
```

This talks to the database directly, not through the running backend, so it
can't push a live WebSocket update — refresh any already-open browser tabs
afterward.

## Other commands

From `frontend/`, `backend/`, or `shared/`:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (frontend/backend only)
npm test            # vitest run
npm run build       # production build (frontend/backend only)
```

Backend-only:

```bash
npm run seed         # insert the demo dataset (additive, non-destructive)
npm run reset-demo    # clear all orders, then reseed with fresh timestamps
npm run db:generate  # generate a Drizzle migration from schema.ts
npm run db:migrate   # apply migrations
```

From the repo root:

```bash
npm audit   # across the whole workspace
```

---

## Architecture

```
   BROIL client        FRY client        WINDOW client
        │                   │                   │
        │  HTTP mutation    │                   │  WebSocket
        └─────────┬─────────┴─────────┬─────────┘
                   ▼                   │
              KDS BACKEND              │
        (Express + validation)         │
                   │                   │
                   ▼                   │
              PostgreSQL               │
                   │                   │
                   ▼                   │
          realtime broadcast ──────────┘
```

A client never talks to another client directly. Every mutation is:
`client → HTTP POST → backend validates → DB transaction → WebSocket
broadcast → every connected client (including the requester) applies the
update`. There are no optimistic local updates — a click does nothing to the
UI by itself; the resulting broadcast is what moves the ticket.

**Snapshot/subscribe race:** a client opens its WebSocket *before* fetching
the REST snapshot, buffers any events that arrive in between, applies the
snapshot as its baseline, then replays the buffered events on top. This means
a mutation that lands during the brief window between "connected" and
"snapshot loaded" is never silently missed.

**Reconnect:** on disconnect, a client shows `RECONNECTING` and disables every
mutating control (`OFFLINE — ACTIONS DISABLED` once fully dropped). It
retries on a fixed 2-second interval and always re-fetches a fresh snapshot on
reconnect rather than assuming no events were missed while it was away.

**Concurrency:** most mutations are a single atomic `UPDATE`, so the last
committed write simply wins. The one real check-then-write mutation — Window
BUMP, which must verify every station ticket is already `BUMPED` — uses
`SELECT ... FOR UPDATE` inside the same transaction, so a concurrent station
RECALL can't sneak in between the check and the write.

### POS-neutral ingestion boundary

`POST /api/orders` accepts a `NormalizedOrder` — a vendor-neutral shape
(`orderNumber`, `table`, `server`, `items[]`, each with `name`/`quantity`/
`modifiers`/`station`) with no Square, Toast, or Aloha types anywhere near it.
`ingestion.createOrder()` is the single canonical path from a normalized order
to routed `StationTicket`s: it reuses the exact same `routeOrderToStationTickets`
function stations already trust, then persists whatever routing decided. The
demo seed script is, structurally, just the first and simplest caller of this
boundary — a future Mock POS, standalone order entry, or a real POS adapter
all funnel through the same function.

### API reference

All paths below are relative to `http://localhost:4000` (or whatever `PORT`
is set to). A rejected mutation never mutates state or broadcasts anything.

| Method | Path | Body | On success | On rejection |
|---|---|---|---|---|
| GET | `/health` | — | `{ status, database, websocketClients }` | — |
| GET | `/api/kitchen/snapshot` | — | `{ tickets: StationTicket[], expoOrders: Record<orderId, ExpoOrderState> }` | — |
| POST | `/api/tickets/:ticketId/items/:itemId/complete` | — | `200` + the updated `StationTicket` | `404` — ticket/item not found, ticket not `ACTIVE`, or item already `READY` |
| POST | `/api/tickets/:ticketId/items/:itemId/uncomplete` | — | `200` + the updated `StationTicket` | `404` — ticket/item not found, ticket not `ACTIVE`, or item already `PENDING` |
| POST | `/api/tickets/:ticketId/bump` | — | `200` + the updated `StationTicket` | `404` — ticket not found or not eligible to bump |
| POST | `/api/tickets/:ticketId/recall` | — | `200` + the updated `StationTicket` | `404` — ticket not found or not eligible to recall |
| POST | `/api/orders/:orderId/expo/bump` | — | `200` + the updated `ExpoOrderState` | `404` if the order doesn't exist, `409` if any station ticket isn't `BUMPED` yet |
| POST | `/api/orders/:orderId/expo/recall` | — | `200` + the updated `ExpoOrderState` | `409` — order was not Window-bumped |
| POST | `/api/orders` | `NormalizedOrder` (below) | `201` + the newly routed `StationTicket[]` | `400` — payload failed validation |

Every mutating endpoint takes no body — the id in the URL is the whole
request. `POST /api/orders` is the one exception, and its body is the
POS-neutral ingestion shape:

```ts
interface NormalizedOrderItem {
  name: string;
  quantity: number;
  modifiers: string[];
  station: "BROIL" | "FRY" | "SALAD" | "HOT_SIDE";   // ProductionStation — see note below
}

interface NormalizedOrder {
  orderNumber: string;
  table: string;
  server: string;
  createdAt?: string;   // ISO timestamp; omit to use "now"
  items: NormalizedOrderItem[];   // must be non-empty
}
```

`station` is typed as `ProductionStation`, not the full `Station` union —
`WINDOW` is Expo's own screen identity (`/station/window`), not a station
that cooks or preps food. An item routed there would produce a
`StationTicket` nothing ever bumps, leaving that order permanently stuck, so
it's excluded at both the type level (`ProductionStation` in
`@zkds/shared`) and at runtime: `isProductionStation()` rejects a `WINDOW` (or
any unrecognized) `station` value with `400`, the same as any other malformed
field.

Validation is manual (a 4-field payload isn't worth a schema library
dependency) but strict: any wrong type, empty string, non-positive quantity,
unrecognized/non-production `station`, or unparseable `createdAt` rejects the
whole request with `400` rather than partially applying it.

### WebSocket events

Connect to the same host/port as the REST API (`ws://` instead of `http://`,
no path). Every message is one JSON object, always carrying the *full*
updated entity — a client applies one by replacing that entity in its local
map by id, never by computing a delta:

```ts
type KitchenEvent =
  | { type: "STATION_TICKET_UPDATED"; ticket: StationTicket }
  | { type: "EXPO_ORDER_UPDATED"; orderId: string; expoOrder: ExpoOrderState }
  | { type: "ORDER_CREATED"; tickets: StationTicket[] };
```

`STATION_TICKET_UPDATED` fires after every item toggle, station bump, and
station recall. `EXPO_ORDER_UPDATED` fires after every Window bump/recall.
`ORDER_CREATED` fires once per successful `POST /api/orders`, carrying every
ticket the new order was routed into. All timestamp fields arrive as ISO
strings — a client must revive them to `Date` itself (`frontend/src/lib/
apiClient.ts` does this on every incoming event and snapshot response).

### Database schema

```
orders
  id (text, pk)            application-generated UUID, stored as text — see note below
  order_number, table_name, server_name (text, not null)
  created_at (timestamptz, not null)

station_tickets
  id (text, pk)             deterministic: `${orderId}-${station}`
  order_id (text, fk -> orders.id, on delete cascade)
  station (enum: BROIL | FRY | SALAD | HOT_SIDE | WINDOW)
  status (enum: ACTIVE | BUMPED | RECALLED, default ACTIVE)
  created_at (timestamptz, not null)
  bumped_at, recalled_at (timestamptz, nullable)
  UNIQUE (order_id, station)

order_items
  id (text, pk)
  order_id (text, fk -> orders.id, on delete cascade)
  station_ticket_id (text, fk -> station_tickets.id, on delete cascade)
  name (text, not null), quantity (integer, not null)
  modifiers (text[], default [])
  station (enum, same as above)
  status (enum: PENDING | READY, default PENDING)
  sent_at (timestamptz, not null)
  completed_at (timestamptz, nullable)

expo_orders
  order_id (text, pk, fk -> orders.id, on delete cascade)   -- no row until the order's first Window bump
  status (enum: ACTIVE | BUMPED | RECALLED, not null)
  bumped_at, recalled_at (timestamptz, nullable)
```

All four `id`/`order_id`/`station_ticket_id` columns are Postgres `text`, not
the native `uuid` type — `routeOrderToStationTickets()` (shared, unchanged
from the pre-backend frontend logic) assigns deterministic string ids like
`1048-BROIL`, which aren't valid UUID format. `orders.id` is still a real
UUID value under the hood (`randomUUID()`), just stored as text so the same
column type works for every table without exceptions.

`ON DELETE CASCADE` on every foreign key means deleting an `orders` row
cleans up its items, station tickets, and Expo state in one operation — this
is what `npm run reset-demo` relies on.

Derived values are never columns: urgency, `waitingOn`, All Day totals, and
`readyForBump` are all computed from these rows on the client (or in shared
pure functions), every time, from scratch.

---

## Implemented features

**Tickets**

- Backend-persisted, routed by `routeOrderToStationTickets()` — one ticket per
  station an order actually touches
- Each card shows table, order number, server, live timer, urgency, and every
  item with its quantity and modifiers
- Active tickets are laid out oldest-first in a responsive grid

**Timers and urgency**

- Elapsed time is always computed from `now - createdAt` on the client, never
  broadcast as a ticking value from the backend — the backend only ever
  stores timestamps
- Formatted `MM:SS`, widening to `H:MM:SS` past an hour
- Thresholds live in a single config object (`ticketThresholds`): WARNING at
  5:00, LATE at 8:00, CRITICAL at 12:00
- Urgency is shown as a colour **and** as the literal word

**Item completion**

- Tapping an item flips it PENDING → READY and stamps `completedAt`
  server-side; tapping again undoes it
- Completed items stay on the ticket — struck through, dimmed, checked, never
  removed
- Once a station's ticket is `BUMPED`, its items go read-only everywhere,
  including on Window — the backend rejects a toggle against a non-`ACTIVE`
  ticket, and the UI now reflects that instead of surfacing the rejection

**Bump / Recall (station)**

- Every active ticket has a full-width BUMP button; a ticket with pending
  items requires confirming a dialog first
- ACTIVE / RECALL tabs, each showing a live count; RECALL lists bumped
  tickets with how long ago they bumped
- Recalling reactivates only that ticket — nothing else on the order is
  touched

**Bump / Recall (Window/Expo)**

- Independent from station lifecycle: Window BUMP only changes that order's
  Expo state once every station ticket is `BUMPED`; it never reopens a
  station
- Window RECALL pulls a dispatched order back onto the active board without
  reopening any station ticket
- Window's own ACTIVE/RECALL split mirrors a station's, showing how long ago
  Expo dispatched each order

**All Day**

- A summary strip totals every item a station still owes across active
  tickets, entirely derived from ticket data — nothing stored

**Realtime sync and connection state**

- Every station/Window screen shows a small, low-key connection badge:
  `CONNECTING` / `ONLINE` / `RECONNECTING` / `OFFLINE — ACTIONS DISABLED`
- Every mutating control (item toggle, BUMP, RECALL) disables while not
  `ONLINE` — no action is ever silently accepted and pretended to succeed
  while disconnected

**Touchscreen UI**

- Dark, high-contrast, large type, readable from several feet away
- Every interactive target is at least 68px tall
- Grid reflows from wide kitchen monitors down to tablets without horizontal
  scrolling

---

## Project structure

```
ZKDS/
├── package.json                     npm workspaces root: frontend, backend, shared
│
├── shared/                          @zkds/shared — imported identically by both packages
│   └── domain/
│       ├── station.ts               Station union, ProductionStation (excludes WINDOW), labels
│       ├── order.ts                 Order, OrderItem, ItemStatus
│       ├── ticket.ts                StationTicket, status predicates
│       ├── expo.ts                  ExpoOrderStatus, ExpoOrderState
│       ├── normalizedOrder.ts       NormalizedOrder/NormalizedOrderItem — POS-neutral ingestion shape
│       ├── routing.ts               routeOrderToStationTickets()
│       ├── transitions.ts           pure COMPLETE/UNCOMPLETE/BUMP/RECALL/WINDOW_BUMP/WINDOW_RECALL logic
│       ├── events.ts                KitchenEvent — the WebSocket wire protocol
│       └── index.ts                 barrel export
│
├── backend/
│   ├── drizzle.config.ts
│   ├── .env.example                 DATABASE_URL, PORT
│   └── src/
│       ├── server.ts                entrypoint: http server + Express + ws upgrade
│       ├── logger.ts
│       ├── db/
│       │   ├── client.ts            pg Pool + drizzle instance
│       │   ├── schema.ts            orders / order_items / station_tickets / expo_orders
│       │   └── migrate.ts
│       ├── domain/
│       │   ├── snapshot.ts          loadSnapshot() -> { tickets, expoOrders }
│       │   ├── mutations.ts         DB-backed transitions (complete/bump/recall/etc.)
│       │   └── ingestion.ts         createOrder(normalizedOrder) — the POS-neutral boundary
│       ├── api/
│       │   ├── router.ts            REST endpoints
│       │   └── health.ts            GET /health
│       ├── realtime/
│       │   ├── server.ts            ws.Server, connection lifecycle, broadcast()
│       │   └── events.ts            re-exports KitchenEvent from @zkds/shared
│       └── seed/
│           ├── seedData.ts          the demo dataset + seedDatabase()
│           ├── seed.ts              `npm run seed` — additive
│           └── reset.ts             `npm run reset-demo` — clear + reseed
│
└── frontend/
    └── src/
        ├── app/
        │   ├── layout.tsx           root layout; mounts KitchenStateProvider once for all routes
        │   ├── page.tsx             redirects / -> /station/broil
        │   └── station/{broil,fry,salad,hot-side,window}/page.tsx
        │
        ├── lib/                     pure functions
        │   ├── apiClient.ts         REST calls, Date revival, WebSocket URL
        │   ├── timers.ts            elapsed + MM:SS / H:MM:SS formatting
        │   ├── ticketUrgency.ts     thresholds + getTicketUrgency()
        │   ├── allDay.ts            All Day totals
        │   ├── orderSummary.ts      buildOrderSummaries() — groups tickets by order for Window
        │   └── expoOrders.ts        buildExpoOrders() — Window's own bump/recall lifecycle
        │
        ├── state/
        │   ├── actions.ts           StationAction type
        │   └── KitchenStateContext.tsx   snapshot + WebSocket sync, connection state, dispatch()
        │
        ├── hooks/
        │   └── useNow.ts            one shared 1s clock
        │
        └── components/kds/          presentational components
            ├── StationPage.tsx / StationHeader.tsx / ConnectionBadge.tsx
            ├── TicketGrid.tsx / KitchenTicket.tsx / KitchenItem.tsx
            ├── RecallList.tsx / RecallTicket.tsx
            ├── WindowPage.tsx / WindowGrid.tsx / WindowOrderCard.tsx / WindowStationSection.tsx
            └── WindowRecallGrid.tsx / WindowRecallCard.tsx
```

### Why Order and StationTicket are separate

An `Order` is the whole table's order. A `StationTicket` is the slice of it
that one station owns. `routeOrderToStationTickets()` turns one order into one
ticket per station that actually has items on it. That's what lets Broil bump
its steaks while the Fry ticket for the same order stays untouched.

### State authority

The backend owns authoritative state. `KitchenStateContext` no longer holds a
local reducer as the source of truth — it fetches a snapshot, subscribes to
the WebSocket, and applies each incoming event by replacing that entity in
local state by id. `dispatch()` fires an HTTP request and does nothing else;
the resulting broadcast (which the requester also receives) is what actually
updates the screen. **A browser refresh or a backend restart no longer resets
kitchen state** — it reloads from PostgreSQL.

## Tests

```bash
npm test   # from shared/, backend/, or frontend/
```

- **shared** (30 tests): every pure transition (complete, undo, bump, recall,
  re-bump, Window bump/recall, and the guards between them), order routing,
  and the `Station`/`ProductionStation` predicates (including that `WINDOW`
  is a valid `Station` but never a valid `ProductionStation`)
- **backend** (20 tests): mutation correctness against a real database
  (correct ticket/item only, others untouched), Expo bump gated on every
  station being bumped, ingestion → routing → persistence, one full
  integration scenario end to end, and `POST /api/orders` production-station
  enforcement (BROIL/FRY/SALAD/HOT_SIDE accepted, `WINDOW` rejected with
  `400` and nothing persisted)
- **frontend** (55 tests): urgency thresholds, elapsed-time formatting, All
  Day totals, order/Expo aggregation, the API client's Date revival and
  action→endpoint mapping, the snapshot/WebSocket sync lifecycle (including
  the buffer-race and reconnect-and-resnapshot paths), the memoization
  boundary that keeps a large board from re-rendering on an unrelated update,
  and that Window cannot dispatch an item toggle against a `BUMPED` ticket

---

## Troubleshooting

**`Cannot find module './NN.js'` from `.next/server/webpack-runtime.js`.**
Stale/inconsistent generated Next.js build output — not an application bug.
Happens after workspace restructuring, killed dev servers, or an interrupted
build. Fix: stop the frontend dev server, delete `frontend/.next` (never
`node_modules`, never source), restart `npm run dev`.

**`next build` breaks the already-running `next dev` server.** Both write to
the same `frontend/.next` by default. Running a production build while `npm
run dev` is live on port 3000 will leave that dev server serving a broken mix
of dev and production artifacts (typically 500s). If you need a production
build alongside a running dev server — e.g. to test whether a bug is
dev-tooling-only — build a separate copy of `frontend/` with its own
`node_modules` junction/symlink rather than building in place. Otherwise:
stop the dev server first, build, test, then delete `.next` and restart
`npm run dev` to regenerate clean dev output.

**Backend refuses to connect / `password authentication failed`.** Check
`backend/.env`'s `DATABASE_URL` — most commonly the username was changed
without updating the password (or vice versa). The password is never printed
by anything in this repo; if it's wrong, re-set it directly in `.env`.

**A device on the LAN/VPN loads the page but nothing works (no data, no
realtime updates).** Almost always `NEXT_PUBLIC_API_URL` — see [Accessing
from another device](#accessing-from-another-device-phone-tablet-second-laptop)
above. `localhost` in that variable resolves to the *connecting device*, not
your backend's machine.

**A mutation returns `404`/`409` for a ticket/order that looks fine in the
UI.** The backend enforces the same lifecycle rules described in the [API
reference](#api-reference) regardless of what a disabled/enabled button
implies client-side — e.g. an item toggle against a `BUMPED` ticket is always
rejected. If a client's UI doesn't already reflect that (as Window briefly
didn't — see Step 5 above), that's a client bug to fix, not a backend
behavior to relax.

**Hydration warnings on `<html>`/`<body>` (extra attributes, empty `style`
object) that don't reproduce in a production build.** Confirmed dev-tooling
or browser-extension interference, not application code — Next's own
dev-only indicator bundle mutates `document.body.style` directly outside
React, and this repo's application code never touches `document.body` or
`document.documentElement` anywhere. Reproduce against `next build && next
start` before suspecting app code; if it doesn't reproduce there, it isn't
ours.

---

## Not implemented yet

Deliberately out of scope so far:

- Mock POS / standalone order entry UI, REFIRE, table reassignment
- Square / Toast / Aloha integrations (the ingestion boundary is ready for
  them; no adapter exists yet)
- Authentication, employee accounts, manager permissions, manager dashboard
- Payments, inventory, reporting/analytics
- Multiple restaurants, admin menu editor
- Customer-facing ordering
- Cloud deployment, containerization
- Offline write queueing — while disconnected, mutating actions are disabled
  rather than queued
