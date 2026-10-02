# Phase 2 API — safety & QR

All endpoints need `Authorization: Bearer <jwt>`. Errors added in this phase
always have the shape `{ "success": false, "code": "...", "message": "..." }`
(plus extra fields where noted), so apps can switch on `code`.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `MONGODB_URI` | — (required) | Mongo connection string |
| `GOOGLE_MAPS_API_KEY` | — | Server key for ETA (Distance Matrix) |
| `REQUIRE_PRETRIP_CHECKLIST` | `false` | Block `startTrip` until today's van check is done |
| `PRETRIP_CHECKLIST_ITEMS` | 8 defaults | JSON `[{"key":"tyres","label":"Tyres OK"}]` |

## 1. Child-left-behind — `POST /trips/endTrip` (and `/trips/endTripForDrop`)

Drop trips only. Pick trips behave as before.

Request (new optional fields):
```json
{ "tripId": "…", "lat": 24.86, "long": 67.0, "forceEnd": true, "confirmationNote": "Checked the van, Ali's father picked him up from school" }
```

409 when kids are picked but not dropped and `forceEnd` isn't true:
```json
{ "success": false, "code": "KIDS_NOT_DROPPED",
  "message": "2 students are still marked as in the van: Ali, Sara. Drop them first, or check the van and confirm.",
  "kids": [{ "kidId": "…", "fullname": "Ali" }, { "kidId": "…", "fullname": "Sara" }] }
```
400 `CONFIRMATION_NOTE_REQUIRED` when `forceEnd` has no note.

Success: unchanged, plus `"undroppedKids": [...]` when forced. Forced kids stay
`picked`; their parents get "Drop not confirmed"; the school gets an ADMIN
alert and socket `childLeftBehindAlert`.

## 2. Driver SOS — `POST /alert/sos`

```json
{ "tripId": "…optional…", "lat": 24.86, "lng": 67.0, "message": "Accident near Gulshan" }
```
200:
```json
{ "success": true, "message": "SOS sent to school admin",
  "data": { "alertId": "…", "tripId": "…|null", "parentsNotified": 12 } }
```
400 `INVALID_LOCATION`, 429 `SOS_RATE_LIMITED` (30 s per driver).

## 3. QR pickup

Card payload printed as a QR: `smartvan:kid:<24-char token>`.

### Driver — `POST /trips/scanStudent`
```json
{ "tripId": "…", "qrPayload": "smartvan:kid:AbC…", "lat": 24.86, "lng": 67.0 }
```
200:
```json
{ "success": true, "message": "Ali picked up",
  "data": { "action": "picked", "kidId": "…", "fullname": "Ali", "tripId": "…" } }
```
`action` is `picked` or `dropped`. Rules: pick trip → first scan picks, second
scan is `ALREADY_PICKED` (kids are dropped at school by ending the trip).
Drop trip → first scan picks from school, second scan drops (needs lat/lng).

400 codes: `INVALID_QR`, `TRIP_NOT_FOUND`, `TRIP_NOT_ONGOING`, `TRIP_NOT_YOURS`,
`KID_NOT_ON_TRIP`, `ALREADY_PICKED`, `ALREADY_DROPPED`, `LOCATION_REQUIRED`.
Errors thrown by the underlying pick/drop (e.g. "Kid is not active") keep
their existing message.

### Admin / school staff (scoped to their school; superadmin: any)
- `GET /kid/qr/cards?vanId=…` (superadmin also `&schoolId=…`)
  → `{ success, total, data: [{ kidId, fullname, grade, image, vanId, status, qrPayload }] }`
- `GET /kid/:id/qr` → `{ success, data: { kidId, fullname, qrToken, qrPayload } }`
- `POST /kid/:id/qr/regenerate` → same shape; the old card stops working.

## 4. Pre-trip checklist

- `GET /trips/checklist/items` → `{ success, required, data: [{ key, label }] }`
- `GET /trips/checklist/today` → `{ success, required, data: checklist | null }`
- `POST /trips/checklist`
  ```json
  { "routeId": "…optional…", "photoUrl": "https://…optional…",
    "items": [{ "key": "tyres", "ok": true }, { "key": "brakes", "ok": false, "note": "Soft pedal" }] }
  ```
  Every key from `items` must be answered once → else 400 `INVALID_CHECKLIST`.
  One checklist per van per day; posting again updates it.
- `POST /trips/startTrip` → 409 `CHECKLIST_REQUIRED` when required and missing.

## Socket events (Socket.IO, same JWT auth)

Admin dashboards: emit `joinSchoolAlerts` (superadmin: `{ schoolId }`) →
`joinedSchoolAlerts`, then listen on room `school:<schoolId>`:

| Event | Room(s) | Payload |
|---|---|---|
| `sosAlert` (driver) | trip room + school | `{ source:"driver", alertId, tripId, driverId, driverName, vanId, vanNumber, location:{lat,lng}, message, at }` |
| `childLeftBehindAlert` | school | `{ alertId, tripId, driverId, driverName, vanId, kids:[{kidId,fullname}], note, createdAt }` |
| `pretripChecklistAlert` | school | `{ alertId, checklistId, driverId, driverName, vanId, failedItems:[{key,ok,note}], photoUrl, createdAt }` |

The existing parent SOS still emits `sosAlert` (without `source`) on the trip room.

All three alerts are also saved as ADMIN notifications, so they appear in
`GET /alert/getDriverAlertsForAdmin` (types `sos`, `child_left_behind`,
`pretrip_issue`).
