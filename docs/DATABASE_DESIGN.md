# RentFlow database foundation

## Scope and source requirements

Segment 03 uses the official `mongodb` Node.js driver, without an ORM. No business APIs, auth records, sample data, or payment integration are created. The assignment PDF was not available in the workspace. Every equipment field explicitly supplied in the request is covered below; category values, rental-unit choices, approval states, and workflow details are provisional until the PDF is reviewed.

## Database and startup

The recommended database name is `rentflow`, set explicitly through `DATABASE_NAME`. Use separate names such as `rentflow_test` for disposable test environments. The connection URI's database path does not override DATABASE_NAME.

`src/config/env.js` loads `.env.local`, then `.env`; existing shell/hosting variables take priority. `MONGODB_URI` and `DATABASE_NAME` are required to start the server or run database commands. The name is restricted to 1-63 ASCII letters, digits, underscores, or hyphens to keep configuration predictable.

`src/config/database.js` owns one MongoClient and its connection pool per process. Concurrent startup calls share a promise. Startup connects and pings before opening the HTTP port. Invalid credentials/configuration or an unreachable deployment cause a sanitized message and nonzero exit. There is no silent database-free startup mode. Restart after correcting a failed startup. Normal operations reuse `getDatabase()`; never instantiate a client in a request handler.

The pool allows ten application connections per server; the driver may also use monitoring sockets. Server selection and individual connection timeouts are five seconds, socket inactivity timeout is ten seconds, and health ping has a three-second operation timeout. These bound individual operations, not necessarily total startup wall-clock time (DNS and multiple phases may add time). The driver handles topology changes/reconnection within its existing pool. Shutdown drains HTTP requests and closes MongoDB, subject to the existing ten-second shutdown deadline.

`GET /api/health` remains liveness and returns the unchanged API message. `GET /api/health/database` is readiness: it pings the existing connection and returns only `{ "success": true, "message": "Database is available" }` with 200, or `{ "success": false, "message": "Database is unavailable" }` with 503. Both bypass caching. Neither reveals database names, hosts, versions, credentials, or driver errors. Before a successful startup there is no HTTP listener to query. The database check does not prove indexes were deployed; that is a separate setup step.

## Collections and identifiers

| Collection | Ownership and purpose |
| --- | --- |
| `users` | Better Auth owns creation, core schema, auth IDs, and indexes in the authentication segment. This segment only plans profile additions. |
| `equipment` | Owner listings and moderation state. |
| `favorites` | One saved equipment item per customer. |
| `bookings` | Rental dates, quantity, price snapshot, and rental lifecycle. |
| `payments` | Payment attempts and external transaction references for a booking. |
| `reviews` | Customer feedback for a completed rental. |

`db:setup` prepares only the five application collections through index creation. It intentionally does not create `users`, insert users, or enforce an auth schema. In the auth segment, configure Better Auth's user model name to `users` and confirm the installed adapter's mapping. Better Auth will also need its own session, account, and verification storage for sessions, provider/credential accounts, and verification tokens. These are technically required auth internals, not additional application collections; their exact names and schemas are deferred to Better Auth. None is created here.

All application documents use BSON ObjectId `_id` values. All equipment references (`equipmentId`) and booking references (`bookingId`) are BSON ObjectIds, not emails or mixed strings. Convert validated 24-hex IDs at a future API boundary and return hex strings in JSON.

All user references (`ownerId`, `customerId`, `reviewedBy`) are the exact opaque **string** ID exposed by Better Auth as `user.id`. Never use an email as a foreign key or assume every auth ID is an ObjectId. The adapter may internally store `_id` differently; preserve its mapping. Auth integration must verify that a user returned by the adapter can be joined through this canonical ID before enabling writes.

MongoDB does not enforce foreign keys. Future business code must verify referenced users/equipment/bookings, permissions, and consistency. Snapshot owner and price on bookings; do not rewrite historical totals when a listing changes. Prefer archiving referenced equipment and retaining booking/payment history over cascaded deletion.

## Common types and money

- Use BSON Date for timestamps (`createdAt`, `updatedAt`, rental dates). JSON examples use Extended JSON dates.
- Monetary fields end in `Minor` and are BSON Int64 (`Long`) with integer minor units. For example, USD 25.00 is `2500`, JPY 2500 is `2500`. Never store binary floating-point currency amounts such as 25.99.
- Store a lowercase ISO currency code beside each price/total. USD examples below are illustrative, not a chosen production currency. Confirm the Stripe account's supported currencies later.
- At future write/API boundaries validate a nonnegative `Number.isSafeInteger` amount before `Long.fromNumber()`. Keep amounts and intermediate sums/products within `Number.MAX_SAFE_INTEGER`, convert to a checked number when calling Stripe, and use the currency's actual exponent. Do not blindly multiply every currency by 100 or use `parseFloat` for price input.
- Rental units and quantity are positive integers. Amount/currency snapshots on bookings and payments must match the server-calculated quote.

## Field plan

### Users (auth-owned)

Required profile fields: `name` string, `email` string, `image` optional URL, `role` one of `customer`, `owner`, `admin`, `phone` optional string, `address` optional structured address, and `createdAt` registration date. `updatedAt` tracks profile changes; `emailVerified` and core auth fields remain Better Auth's responsibility. Use `createdAt` for registration date rather than a duplicate date field.

Plan profile extensions through Better Auth's supported additional-fields configuration. Default role is `customer`; role must not be accepted unchecked from signup/profile input. Elevated roles require future trusted authorization. Phone is a string to preserve leading zeroes and country codes. Address uses `line1`, optional `line2`, `city`, optional `region`/`postalCode`, and `countryCode`.

Logical API/profile example only (not a seed document or a prescription for Better Auth's internal BSON record):

```json
{
  "id": "auth-user-id",
  "name": "Example Customer",
  "email": "customer@example.com",
  "emailVerified": false,
  "image": "https://example.com/profile.jpg",
  "role": "customer",
  "phone": "+8801700000000",
  "address": { "line1": "Example Road", "city": "Dhaka", "countryCode": "BD" },
  "createdAt": "2026-11-21T00:00:00.000Z",
  "updatedAt": "2026-11-21T00:00:00.000Z"
}
```

### Equipment

Required: `name`, `description`, `category`, `location`, `rentalPriceMinor`, `currency`, `rentalType`, `quantity`, `condition`, `brand`, `model`, `image`, `rentalTerms`, `ownerId`, `approvalStatus`, `createdAt`, `updatedAt`.

Use a normalized category slug and normalized `location.city` for exact filtering; location also contains address text and countryCode. `rentalPriceMinor` is the price per single unit for one rental interval. Proposed rentalType values: `hourly`, `daily`, `weekly`; finalize against the PDF before building rental forms. Quantity is total rentable stock, not a mutable count of currently free units. Proposed condition values: `new`, `like_new`, `good`, `fair`. Image is a hosted image URL, not binary data. Rental terms are plain text. Proposed approval states: `pending`, `approved`, `rejected`; only approved listings will be publicly rentable. Optional `reviewedBy`, `reviewedAt`, and `rejectionReason` support moderation; `archivedAt` supports retiring listings without losing history.

```json
{
  "_id": { "$oid": "000000000000000000000001" },
  "name": "Cordless Drill", "description": "Drill with charger and case.",
  "category": "power-tools",
  "location": { "city": "dhaka", "address": "Example Road", "countryCode": "BD" },
  "rentalPriceMinor": { "$numberLong": "2500" }, "currency": "usd",
  "rentalType": "daily", "quantity": 3, "condition": "good",
  "brand": "Example Brand", "model": "D100",
  "image": "https://example.com/drill.jpg", "rentalTerms": "Return with charger and case.",
  "ownerId": "auth-owner-id", "approvalStatus": "pending",
  "createdAt": { "$date": "2026-11-21T00:00:00Z" },
  "updatedAt": { "$date": "2026-11-21T00:00:00Z" }
}
```

### Favorites

Required: `_id`, `customerId`, `equipmentId`, `createdAt`. The compound unique index prevents duplicate favorites per customer, and its leading customerId supports their saved-items query.

```json
{
  "_id": { "$oid": "000000000000000000000002" },
  "customerId": "auth-user-id", "equipmentId": { "$oid": "000000000000000000000001" },
  "createdAt": { "$date": "2026-11-21T00:00:00Z" }
}
```

### Bookings

Required: `customerId`, `ownerId`, `equipmentId`, `startAt`, `endAt`, `quantity`, `rentalType`, `billingUnits`, `unitPriceMinor`, `totalMinor`, `currency`, `status`, `createdAt`, `updatedAt`. Store the equipment's IANA `rentalTimeZone` snapshot when interpreting local rental times. Optional `holdExpiresAt` is used only if the future workflow holds inventory while awaiting payment; `cancelledAt`, `cancellationReason`, and `completedAt` explain terminal transitions. No TTL index deletes booking history.

```json
{
  "_id": { "$oid": "000000000000000000000003" },
  "customerId": "auth-user-id", "ownerId": "auth-owner-id",
  "equipmentId": { "$oid": "000000000000000000000001" },
  "startAt": { "$date": "2026-12-01T03:00:00Z" }, "endAt": { "$date": "2026-12-03T03:00:00Z" },
  "rentalTimeZone": "Asia/Dhaka", "quantity": 1, "rentalType": "daily", "billingUnits": 2,
  "unitPriceMinor": { "$numberLong": "2500" }, "totalMinor": { "$numberLong": "5000" }, "currency": "usd",
  "status": "pending", "createdAt": { "$date": "2026-11-21T00:00:00Z" },
  "updatedAt": { "$date": "2026-11-21T00:00:00Z" }
}
```

### Payments

One document per payment attempt; a booking may have multiple attempts. Required: `_id`, `bookingId`, `customerId`, `amountMinor`, `currency`, `status`, `createdAt`, `updatedAt`. Plan `provider: "stripe"`, a server-generated `idempotencyKey`, optional `stripePaymentIntentId`, `stripeCheckoutSessionId`, `stripeChargeId`, `paidAt`, and `refundedMinor`. Omit Stripe IDs until assigned; do not write empty strings or fake IDs. Never store card data, Stripe secrets, or PaymentIntent client secrets.

```json
{
  "_id": { "$oid": "000000000000000000000004" },
  "bookingId": { "$oid": "000000000000000000000003" }, "customerId": "auth-user-id",
  "provider": "stripe", "idempotencyKey": "payment-attempt-example",
  "amountMinor": { "$numberLong": "5000" }, "refundedMinor": { "$numberLong": "0" },
  "currency": "usd", "status": "pending",
  "createdAt": { "$date": "2026-11-21T00:00:00Z" }, "updatedAt": { "$date": "2026-11-21T00:00:00Z" }
}
```

### Reviews

Required: `_id`, `bookingId`, `customerId`, `equipmentId`, integer `rating` from 1-5, plain-text `comment`, `createdAt`, `updatedAt`. Plan one review per customer per completed booking. The server must ensure the booking belongs to this customer and equipment; the unique index alone cannot establish eligibility.

```json
{
  "_id": { "$oid": "000000000000000000000005" },
  "bookingId": { "$oid": "000000000000000000000003" }, "customerId": "auth-user-id",
  "equipmentId": { "$oid": "000000000000000000000001" }, "rating": 5, "comment": "Worked well.",
  "createdAt": { "$date": "2026-12-04T00:00:00Z" }, "updatedAt": { "$date": "2026-12-04T00:00:00Z" }
}
```

This review illustrates the later completed state of the example rental; it must not be inserted while that booking remains pending. All examples are documentation only.

## Rental dates and lifecycle rules (planned, not implemented)

- Store UTC instants, but require explicit offsets/timezone when accepting local times. Reject invalid dates, missing timezone context, end <= start, nonpositive/noninteger quantity, and a start in the past when creating a new rental.
- Use half-open intervals `[startAt, endAt)`. A rental ending at 10:00 does not overlap one starting at 10:00. Overlap query: existing `startAt < requestedEnd` AND existing `endAt > requestedStart`.
- Proposed billing: hourly = 60 elapsed minutes, daily = 24 elapsed hours, weekly = seven such days; round up incomplete units with a minimum of one. A later calendar-day policy requires timezone-aware changes; do not assume all local days have 24 hours. Compute the final total on the server: unitPriceMinor * billingUnits * quantity, with safe-integer checks. Deposits, taxes, discounts and refund terms are deferred until specified.
- Booking states: `pending` -> `confirmed` -> `active` -> `completed`; pending may become `expired` or `cancelled`, confirmed may become `cancelled` subject to policy. Completed/cancelled/expired are terminal. Payment success alone must not bypass stock/approval checks. Owner acceptance, if required by the PDF, will be incorporated before implementation.
- Count `confirmed`, `active`, and unexpired pending holds toward occupied stock. Pending without a valid hold does not reserve inventory. Completed/cancelled/expired do not block future rentals. Avoid overselling using future atomic inventory coordination/transactions; a date index or a simple check-then-insert does not prevent concurrent overbooking.
- Payment states: `pending`, `processing`, `succeeded`, `failed`, `cancelled`, `partially_refunded`, `refunded`. Successful charges may become partially_refunded or refunded; a failed/cancelled attempt is replaced by a new attempt. Refunds cannot exceed the original amount. Booking and payment statuses are separate; cancellation does not itself prove a refund happened.
- Only verified server-side payment results/webhooks can confirm money movement. Map Stripe's raw statuses to these application states later. PaymentIntent/idempotency uniqueness prevents duplicate attempt identities but does not implement webhook replay handling or prevent two separate successful charges for a booking; those require transactional state transitions and event idempotency in the Stripe segment.

## Indexes

All collections get MongoDB's unique `_id` index. `src/config/database-indexes.js` is the exact executable index plan:

| Collection/index | Keys | Purpose |
| --- | --- | --- |
| equipment_search | name text, category text | Token-based search, not substring autocomplete; language `none` avoids stemming assumptions. |
| equipment_category_approval | category asc, approvalStatus asc | Exact category/approval filters. |
| equipment_location_approval | location.city asc, approvalStatus asc | Normalized city and approval filtering. |
| equipment_approval_recent | approvalStatus asc, createdAt desc | Moderation queues and approved listings. |
| equipment_owner_recent | ownerId asc, createdAt desc | Owner's listings. |
| favorites_customer_equipment | customerId asc, equipmentId asc, unique | Saved-items lookup and duplicate prevention. |
| bookings_equipment_dates | equipmentId asc, status asc, startAt asc, endAt asc | Candidate rental overlaps; the second range may still require filtering. |
| bookings_customer_recent | customerId asc, createdAt desc | Customer rental history. |
| bookings_owner_recent | ownerId asc, createdAt desc | Owner rental history. |
| payments_booking_recent | bookingId asc, createdAt desc | Attempts for a booking. |
| payments_stripe_intent | stripePaymentIntentId asc, unique partial string | External transaction identity; absent/null fields are excluded. |
| payments_idempotency | idempotencyKey asc, unique partial string | One attempt per idempotency key. |
| reviews_booking_customer | bookingId asc, customerId asc, unique | One review per completed rental/customer. |
| reviews_equipment_recent | equipmentId asc, createdAt desc | Equipment feedback. |

No application indexes are imposed on Better Auth's users yet. The adapter will manage core auth indexes; confirm role-query needs later. No Atlas Search service, geo index, TTL deletion, or extra collection is necessary now.

Run `npm run db:setup` explicitly before deployment. Repeating it with unchanged definitions is idempotent: it neither duplicates indexes nor inserts documents. It never drops collections/indexes or changes existing records to make a unique index succeed. Conflicting existing indexes or duplicate data cause failure for manual review. Setup is not transactional: a failed run can leave earlier indexes created; rerun safely after resolving the issue. Review versioned migrations before changing existing index keys/options.

Only environment validation helpers needed by the current code are implemented. Document-field checks above are a contract for future write APIs, not claims of enforced MongoDB schema validation. No permissive fake validators or unused CRUD helpers were added. When writes arrive, validate types, enums, ID conversions, ownership, dates, precision, URLs and string lengths on the server; add MongoDB validators deliberately without interfering with Better Auth.

## Configure Atlas and verify

1. Create/select an Atlas cluster and a **database user**, distinct from the Atlas dashboard account. Give it readWrite on the intended application database (including collection/index creation for setup).
2. Add the application machine's outbound IP to the Atlas network access list. Prefer the required addresses over public access. Production servers need their own outbound IP access.
3. Use Atlas Connect -> Drivers -> Node.js to obtain the URI. Replace credentials locally, percent-encoding reserved characters in username/password. Do not place it in frontend env variables or Git.
4. Put `MONGODB_URI` and `DATABASE_NAME=rentflow` in ignored `backend/.env.local` or `.env`. Existing .env.local wins over .env; avoid keeping conflicting values. The earlier MONGODB_URL spelling is no longer used.
5. From backend, run:

```powershell
npm ci
npm run check
npm test
npm run db:check
npm run db:setup
npm run db:setup
npm start
```

`db:check` only connects/pings and closes. `db:setup` creates the five empty application collections and indexes, without auth records or sample data. Both return nonzero with safe messages on failure. The second setup run checks real idempotency when credentials work.

In another terminal:

```powershell
curl.exe -i http://localhost:5000/api/health
curl.exe -i http://localhost:5000/api/health/database
```

The existing frontend proxy also forwards `/api/health/database`; no frontend source change is needed. Stop the server with Ctrl+C to release its pool.

Offline `npm test` overrides local DB settings and mocks the driver for reuse/cleanup/failure tests. Those checks do not prove Atlas connectivity or real index creation. Live verification must use valid credentials. If authentication fails, correct/rotate the database user's password and update the local URI. For network failures, check the access list, DNS, firewall, cluster status, and host connectivity. Never paste the URI or raw driver errors into public logs.

## References

- [MongoDB connection pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/)
- [MongoDB indexes](https://www.mongodb.com/docs/drivers/node/current/indexes/)
- [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/)
- [Better Auth MongoDB adapter](https://better-auth.com/docs/adapters/mongo)
- [Better Auth database concepts](https://better-auth.com/docs/concepts/database)
- [Stripe currency minor units](https://docs.stripe.com/currencies)
