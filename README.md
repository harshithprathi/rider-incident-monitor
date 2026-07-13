# Rider Incident Monitor

Real-time safety platform — backend, real-time, and dashboard engineering.

## How to Run Locally

### Prerequisites
- Docker and Docker Compose (recommended)
- OR Node.js 20+, MongoDB 6+, Redis 7+

### Using Docker Compose (Recommended)

```bash
docker compose up
```

This starts:
- **MongoDB** on port 27017
- **Redis** on port 6379
- **Backend API** on http://localhost:3000
- **Frontend Dashboard** on http://localhost:4200

### Manual Setup

```bash
# Install dependencies from workspace root
npm install

# Start MongoDB and Redis (e.g., via Docker)
docker compose up mongodb redis -d

# Seed sample data
npx nx run backend-api:build
node apps/backend-api/dist/utils/seed.js

# Run backend (port 3000)
npx nx serve backend-api

# Run frontend (port 4200)
npx nx serve frontend-dashboard
```

### Sample Login Credentials
- **Rider:** john@example.com / test123
- **Responder:** sarah@emergency.com / test123

---

## Data Model & Index Rationale

### Entities

| Collection | Purpose |
|---|---|
| `riders` | User profiles of riders |
| `responders` | Responder profiles with org/region membership |
| `organizations` | Organization configuration with available regions |
| `incidents` | Emergency records (type, status, rider, location, sensor data) |
| `incident_updates` | Immutable append-only log per incident with sequence numbers |
| `safe_return_sessions` | Rider journey tracking with deadlines |
| `idempotency_records` | Deduplication records for concurrent ingestion |

### Compound Indexes

| Index | Collection | Query Pattern |
|---|---|---|
| `{ organizationId, region, status, createdAt }` | incidents | Responder dashboard: filtered + sorted + paginated incident list scoped to their org/region |
| `{ riderId, createdAt }` | incidents | Lookup incidents by rider, ordered by recency |
| `{ type, createdAt }` | incidents | Filter incidents by type with time ordering |
| `{ incidentId, sequenceNumber }` (unique) | incident_updates | R2: Gap-free sequence enforcement. Prevents duplicate sequence numbers under concurrency |
| `{ incidentId, sequenceNumber: -1 }` | incident_updates | Feature B: Replay last 20 updates (descending sort for limit+reverse pattern) |
| `{ incidentId, createdAt: -1 }` | incident_updates | Time-range queries on updates |
| `{ riderId, status }` | safe_return_sessions | Lookup active session for a rider (unique per rider when ACTIVE) |
| `{ key }` (unique) | idempotency_records | Feature C: Atomic reservation for concurrent deduplication |
| `{ expiresAt }` (TTL) | idempotency_records | Auto-cleanup: expired records removed after 24 hours |

---

## Engineering Requirements

### R1 — Race-Free Incident Status Transitions

**Implementation:** `IncidentService.resolveIncident` uses `findOneAndUpdate` with a status guard condition:

```typescript
const incident = await Incident.findOneAndUpdate(
  { _id: id, status: IncidentStatus.LIVE },  // Only update if currently LIVE
  { $set: { status: IncidentStatus.RESOLVED } },
  { new: true }
);
```

If two responders attempt to resolve simultaneously, exactly one wins (the one whose `findOneAndUpdate` matches first). The other gets `null` and receives an error response. No read-modify-write pattern — single atomic operation.

Safe Return completion uses the same pattern — `findOneAndUpdate` with `status: SafeReturnStatus.ACTIVE` guard.

### R2 — Causally-Ordered, Gap-Free Incident Update Stream

**Implementation:** `IncidentUpdateService.createUpdate` generates sequence numbers by querying the current max and incrementing. A unique compound index `(incidentId, sequenceNumber)` prevents duplicates. On collision (duplicate key error), the service retries with a bounded iterative loop (max 5 attempts).

**Replay:** Socket.IO `join_incident` replays the last 20 updates sorted by sequence number, then subscribes to live updates via EventBus. Clients receive `sequenceNumber` on every update and can detect gaps.

### R3 — Authorization & Tenancy Isolation

**Implementation:** A single `authorizeResponder` middleware enforces org/region scoping across ALL REST routes. The same check runs in `SocketHandler.handleJoinIncident` for WebSocket rooms.

```typescript
// Middleware checks user's org/region matches the resource
// Applied once, not copy-pasted per route
```

**IDOR protection:** `GET /incidents/:id` returns 403 if the incident's org/region doesn't match the authenticated user. `join_incident` socket event rejects with an error if scope doesn't match.

### R4 — Crash-Safe Scheduling & Restart Reconciliation

**Implementation:** `StartupReconciliation` runs on application boot:

1. **Cleans up stale jobs** — removes old Bull queue entries
2. **Re-arms active sessions** — queries all `ACTIVE` safe return sessions, recalculates delays, and re-enqueues warning/deadline jobs
3. **Fires missed deadlines** — any session whose deadline elapsed while the server was offline gets processed immediately (creates exactly one `SAFE_RETURN_MISSED` incident)

Bull queue jobs are stored in Redis, so pending jobs survive process restart. The reconciliation ensures nothing is missed even if Redis was cleared.

### R5 — Graceful Shutdown with In-Flight Draining

**Implementation:** `Application.setupGracefulShutdown` handles SIGTERM/SIGINT:

1. Stop accepting new HTTP connections (`httpServer.close()`)
2. Close Socket.IO connections (`socketHandler.gracefulShutdown()`)
3. Close queue and drain in-flight jobs (`queueService.gracefulShutdown()`)
4. Close database connections (`disconnectDatabase()`, `disconnectRedis()`)

Guard flag `isShuttingDown` prevents double-shutdown. Uncaught exceptions and unhandled rejections also trigger graceful shutdown.

### R6 — Resilient Background Processing

**Implementation:**
- **Retry strategy:** Bull default with 3 attempts and exponential backoff
- **Dead-letter queue:** Failed jobs after all retries go to a dead-letter handler
- **Correlation IDs:** `AsyncLocalStorage` provides request-scoped correlation IDs that flow through async operations including queue processors. The logger reads from `AsyncLocalStorage` automatically.
- **Clean socket tracking:** Socket.IO disconnect handler removes socket from tracked rooms; no unbounded growth

---

## Feature C — Concurrency Model

### Problem
Rider devices retry on flaky networks. The same crash can arrive multiple times concurrently from retry storms. We must guarantee exactly one incident and one notification fan-out.

### Solution: Atomic Reservation Pattern

1. **Client supplies `Idempotency-Key` header** (e.g., `crash-{deviceId}-{timestamp}`)

2. **Reserve phase:** Attempt `IdempotencyRecord.create({ key, status: 'PROCESSING' })`. The unique index on `key` guarantees at most one succeeds. Concurrent duplicates get a `11000` duplicate key error.

3. **Winner creates incident:** The one request that reserved the key creates the incident, generates the first update (sequence 1), and stores the result in the idempotency record.

4. **Losers wait or return cached:** Concurrent requests that failed reservation either:
   - Get `REQUEST_IN_PROGRESS` if the winner is still processing
   - Get the cached response from the completed idempotency record

5. **TTL cleanup:** Idempotency records expire after 24 hours via MongoDB TTL index.

### Failure Windows Considered

| Window | Risk | Mitigation |
|---|---|---|
| Two requests arrive within microseconds | Double insert | Unique index on `key` — MongoDB rejects the second |
| Winner crashes mid-processing | Orphaned PROCESSING record | TTL expiry cleans up; subsequent retry will find expired record and retry |
| Network partition between app and DB | Partial write | Reservation is atomic (single document insert). Incident creation failure rolls back by not marking record COMPLETED |
| Multiple server instances | Cross-instance race | MongoDB unique index is cluster-wide — works regardless of which server instance handles the request |

### Test
`concurrency.test.ts` fires 100 concurrent requests with the same idempotency key and verifies:
- All return the same incident ID
- Exactly one incident exists in database
- Exactly one idempotency record exists
- Sequence numbers have no gaps

---

## Trade-offs & Shortcuts

1. **Sequence number generation:** Uses find-max-and-increment with retry instead of a dedicated counter collection. Acceptable for moderate concurrency; a counter collection with `$inc` would be better for extreme write loads.

2. **Password hashing:** Uses bcrypt with 10 salt rounds. For production, consider Argon2id.

3. **Logger:** Custom structured logger instead of Winston/Pino. Keeps dependency count low but lacks features like log rotation and transports.

4. **Frontend state:** Uses `useState` and `useContext` per requirements. No global state library — each page manages its own state.

5. **Notification delivery:** Warning and deadline notifications are logged to console per the assignment guidance ("log to console").

---

## Tech Stack

- **Backend:** Node.js, TypeScript, Express, MongoDB (Mongoose), Socket.IO, Bull + Redis
- **Frontend:** React (hooks only), MUI component library, Recharts
- **Infrastructure:** Docker Compose, Nx monorepo
