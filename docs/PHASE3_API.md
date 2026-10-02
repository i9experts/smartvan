# Phase 3 API — ETA, overspeed, stats, online fees, chat

Same conventions as `PHASE2_API.md`: JWT on everything (except the payment
webhook), new errors look like `{ success:false, code, message }`.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `OVERSPEED_LIMIT_KMH` | `60` | Above this the trip records an overspeed event |
| `PAYMENTS_MODE` | `off` | `off` → online pay disabled (503), `mock` → test payments, `live` → real gateways (not integrated yet) |

## 1. Location updates — `POST /trips/updateLocation/:tripId`

Body: `{ "lat": 24.86, "lng": 67.0, "speed": 12.5 }` — `speed` is metres/second
from the phone (optional).

Now rejects trips that aren't `ongoing` (400 `TRIP_NOT_ONGOING`) or don't
belong to the caller's van (401).

Parent pushes changed:
- `ETA_UPDATE` push once at ≤10 min and once at ≤3 min per kid per trip
  (data: `tripId, kidId, etaMinutes, etaTime, driverLat, driverLng`).
  Previously sent on every update.
- `GEOFENCE_HOME_ENTERED` for kids still waiting (pick trip: not picked yet,
  drop trip: in the van). `GEOFENCE_HOME_EXITED` is no longer sent.

Socket on the trip room after every update:
```json
{ "event": "etaUpdate", "tripId": "…", "at": "ISO", "eta": [{ "kidId": "…", "minutes": 7, "etaTime": "08:12" }] }
```
ETA is recomputed at most once a minute per trip.

Overspeed: ADMIN notification type `overspeed` + socket `overspeedAlert` on
`school:<schoolId>` — `{ alertId, tripId, driverId, driverName, vanId, speedKmh, limitKmh, location, at }`
(max one per 5 min per trip).

## 2. Driver stats — `GET /trips/driver-stats?days=7`
```json
{ "success": true, "data": { "days": 7, "trips": 12, "distanceKm": 184.3, "drivingMinutes": 540,
  "kidsDropped": 96, "overspeedCount": 1, "maxSpeedKmh": 67, "onTimePercent": 92,
  "safetyScore": 93, "speedLimitKmh": 60 } }
```
`onTimePercent` = trips started within 10 min of the route time (null if
unknown). `safetyScore` = 100 − 5 × overspeed events − up to 20 for late starts.

## 3. Online fees (parent)

- `GET /fees/payment-methods` → `{ mode, methods: [{ key:"jazzcash", label, enabled }] }`
- `POST /fees/pay-online` `{ paymentId, method }` →
  ```json
  { "success": true, "data": { "checkoutId": "…", "paymentId": "…", "method": "jazzcash", "provider": "mock",
    "amount": 3000, "currency": "PKR", "status": "pending", "expiresAt": "ISO",
    "redirectUrl": null, "instructions": "TEST MODE — …", "testMode": true } }
  ```
  Errors: 400 `INVALID_METHOD`, 400 `ALREADY_PAID`, 503 `PAYMENTS_UNAVAILABLE`.
- `GET /fees/pay-online/:checkoutId` → same shape; status `pending|succeeded|failed|expired`.
- `POST /fees/pay-online/:checkoutId/mock-confirm` `{ success?: true }` — mock mode only.
- `POST /fees/webhook/:provider` — for real gateways (no JWT).

On success the fee becomes `paid` (`collectedByType: "online"`) and the parent
gets `PAYMENT_RECEIVED` (now also with `paymentId`).

## 4. Receipts — `GET /fees/receipt/:paymentId`
Parent of the kid, driver of the kid's van, or school admin/staff.
```json
{ "success": true, "data": { "paymentId": "…", "receiptNumber": "SV-…", "schoolName": "…", "schoolPhone": "…",
  "studentName": "Ali", "grade": "5", "month": "2026-10", "amount": 3000, "discountAmount": 0,
  "lateFeeAmount": 0, "currency": "PKR", "paymentMethod": "cash", "collectedByType": "driver", "paidAt": "ISO" } }
```
400 `NOT_PAID` if unpaid.

## 5. Driver fee summary — `GET /fees/driver-summary?month=2026-10`
```json
{ "success": true, "data": { "month": "2026-10", "students": 20, "paid": 14, "pending": 5, "notGenerated": 1,
  "totalPaid": 42000, "totalPending": 15000, "collectedByYou": 30000, "collectedOnline": 12000,
  "currency": "PKR", "byMethod": { "cash": 30000, "jazzcash": 12000 } } }
```

## 6. Chat (parent ↔ driver)

- `POST /chat/start` `{ kidId }` → `{ data: Conversation }` (400 `NO_VAN` / `NO_DRIVER`)
- `GET /chat/conversations` → `{ data: Conversation[] }`
- `GET /chat/unread` → `{ data: { unread: 3 } }`
- `GET /chat/:id/messages?before=ISO&limit=30` → `{ data: Message[] (newest first), hasMore }`
- `POST /chat/:id/messages` `{ text, templateKey? }` → `{ data: Message }` (400 `EMPTY_MESSAGE`)
- `POST /chat/:id/read`

```json
Conversation: { "conversationId": "…", "otherUser": { "id": "…", "type": "driver", "name": "Aslam", "image": null },
  "kids": [{ "kidId": "…", "fullname": "Ali" }], "lastMessage": { "text": "…", "senderType": "parent", "at": "ISO" },
  "unread": 2, "updatedAt": "ISO" }
Message: { "messageId": "…", "conversationId": "…", "senderType": "driver", "senderId": "…", "text": "…",
  "templateKey": "running_late", "readAt": null, "createdAt": "ISO" }
```

Socket: every connection joins `user:<userId>`.
- `chatMessage` → Message (sent to both participants)
- `chatRead` → `{ conversationId, readBy: "parent"|"driver", at }`

Push: `CHAT_MESSAGE` with `conversationId`.
