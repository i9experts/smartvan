# Phase 4 API — absences, waiting at stop, no-show, document expiry

## 1. Absences

Parent (JWT, userType parent):
- `POST /kid/absence` `{ kidId, date: "YYYY-MM-DD", tripType: "pick"|"drop"|"both", note? }`
  → `{ success, message, data: Absence }`. Today up to 60 days ahead. Marking
  the same kid+date again updates it. 400 `INVALID_DATE`, `INVALID_TRIP_TYPE`.
- `GET /kid/absence?kidId=` → `{ data: Absence[] }` (today onwards)
- `POST /kid/absence/:absenceId/cancel`

Driver:
- `GET /kid/absence/today` → `{ data: Absence[] }` for kids on their van

```json
Absence: { "absenceId": "…", "kidId": "…", "date": "2026-10-06", "tripType": "both", "note": "Sick", "createdAt": "ISO" }
```

For an absence dated today the driver gets push `KID_ABSENT` (cancel:
`KID_ABSENCE_CANCELLED`) and socket `kidAbsence` / `kidAbsenceCancelled`
on `user:<driverId>`: `{ kidId, fullname, date, tripType }`.

Absent kids get no ETA or home-geofence pushes for the covered trip.

## 2. Passengers

`GET /Route/getMergedActivePassengers` items now also have:
`absent` (bool), `absenceNote`, `waitingSince` (ISO|null), `noShow` (bool).

## 3. At stop / no-show (driver)

- `POST /trips/arrivedAtStop` `{ tripId, kidId }` → `{ data: { kidId, waitingSince } }`.
  Once per kid per trip; parent push `VAN_AT_STOP`.
- `POST /trips/noShow` `{ tripId, kidId, note? }` — pick trips, kid not picked.
  Parent push `NO_SHOW`.

Errors (400, with `code`): `TRIP_NOT_FOUND`, `TRIP_NOT_ONGOING`,
`TRIP_NOT_YOURS`, `KID_NOT_ON_TRIP`, `NOT_PICK_TRIP`, `ALREADY_PICKED`.

## 4. Driver document expiry

Daily at 08:00 (server time): licence / vehicle card expiring in 30, 15, 7,
1 days or today → push `DOCUMENT_EXPIRY` `{ field, daysLeft }` to the driver
and ADMIN alert type `document_expiry`.

## 5. Live tracking (Oct 12)

Socket `updateLocation` (driver → server), every GPS fix (~2–3 s):
`{ tripId, location: { lat, lng }, speed?: m/s, heading?: degrees }`.
Relayed to the trip room as `locationUpdated`:
`{ tripId, location: { lat, lng, long }, speedKmh, heading, moving, at }`
(no longer written to the DB by the socket; POST /trips/updateLocation keeps the trail).

Parents can now join a trip room when their child is on the trip's route or
on the trip (not only when `VanId` matches).

- `GET /trips/:tripId/route-plan` (driver / parent / school admin):
  `{ type, status, van, school, nextStopOrder, stops: [{ order, kidId, fullname, image, mine, lat, lng, status }], plannedPath: { polyline, distanceMeters, durationSeconds, legs } | null }`
  — stop `status`: `waiting | picked | dropped | absent | no_show`. Order =
  optimized order if the driver optimized, else the route order. Parents only
  see their own kids' names (`mine`). `polyline` is a Google-encoded,
  road-following path from the van through the remaining stops (cached 90 s).
- `GET /trips/:tripId/trail` → `{ polyline, points, startedAt, lastAt }` —
  where the van actually drove.
- Socket `tripStatus` on the trip room after each stored location:
  `{ status: 'moving' | 'stopped' | 'delayed', stoppedSeconds, at }`.
- Traffic delay: stopped ≥ `TRAFFIC_STOP_SECONDS` (default 120) away from any
  stop/school → ADMIN alert type `traffic_delay`, socket `trafficDelayAlert`
  on `school:<id>`, push `TRAFFIC_DELAY` to affected parents. Max once per
  10 min per trip.

## 6. Reliable tracking (Oct 13)

- `POST /trips/updateLocation/:tripId` now also emits `locationUpdated`
  (with `source: 'http'`) to the trip room, so the parent map keeps moving
  when the driver's socket is down. Parents should ignore events older than
  the newest `at` they have.
- `POST /trips/:tripId/locations/batch` (driver) — points recorded offline:
  `{ points: [{ lat, lng, time: ISO, speed?: m/s }] }`, max 2000, merged into
  the trail in time order (no ETA/geofence pushes). Accepted while ongoing or
  up to 30 min after the trip ended. Emits `trailBackfilled { tripId, points }`
  on the trip room → reload `/trips/:id/trail`.
- Tracking lost: no location for `TRACKING_LOST_MINUTES` (default 4) on an
  ongoing trip → ADMIN alert type `tracking_lost` (driver phone in message),
  socket `trackingLostAlert` on `school:<id>`, and `tripStatus
  { status: 'offline', lastSeenAt }` on the trip room. When locations resume:
  `trackingRestored` on the school room and normal `tripStatus` again.

## 7. Trip history & trail (Oct 15)

All endpoints need the JWT. "Today" is the calendar day in
`DEFAULT_TIMEZONE` (Asia/Karachi), matched on the trip's end time.
Trail points are stored on the trip itself and are never deleted (no TTL).
When a trip ends the server saves `startedAt`, `endedAt`, `durationSeconds`
and `distanceMeters` on it. Trips ended before this change get the same
values computed on the fly from `tripStart`/`tripEnd`.

Paging: `page` (default 1), `limit` (default 20, max 50). `scope=today|all`
(default `all`). Newest first.

### Driver — own completed trips

`GET /driver/trips/completed?scope=today&page=1&limit=20`

```json
{ "success": true, "data": {
  "items": [{
    "id": "6710…", "routeName": "Gulshan Morning", "tripType": "pick",
    "date": "2026-10-15",
    "startedAt": "2026-10-15T02:00:04.000Z", "endedAt": "2026-10-15T02:41:10.000Z",
    "durationSeconds": 2466, "distanceMeters": 11840,
    "studentCount": 12, "pickedCount": 10, "droppedCount": 0,
    "absentCount": 1, "noShowCount": 1
  }],
  "total": 37, "page": 1, "limit": 20, "hasMore": true } }
```

`GET /driver/trips/:id/details` → the item above plus:

```json
{ "stops": [{ "order": 1, "placeName": "House 12, Block 5", "lat": 24.9, "lng": 67.1,
              "students": [{ "kidId": "…", "name": "Ayesha", "status": "picked", "at": "2026-10-15T02:10:00.000Z" }] }],
  "alerts": [{ "type": "overspeed", "title": "Overspeeding", "message": "…", "at": "ISO" }],
  "school": { "name": "City School", "lat": 24.86, "lng": 67.0 } }
```

Stop `status`: `picked | dropped | absent | no_show | pending`. Alert `type`:
`sos | overspeed | traffic_delay | tracking_lost` (raised for the van between
start and end). `school` is null if the school has no saved location.
Errors: 404 `TRIP_NOT_FOUND`, 403 `TRIP_NOT_YOURS`.

### Parent — trips that carried their children

`GET /parent/trips/completed?scope=all&page=1&limit=20` — items have
`id, routeName, tripType, date, startedAt, endedAt, durationSeconds,
distanceMeters` and `children: [{ kidId, name, status, at }]` (own children
only; no school-wide counts).

`GET /parent/trips/:id/details` — same plus `driverName`, `vanNumber`,
`school`. **Privacy:** other children's names, stop addresses and the stop
list are never returned. 403 `TRIP_NOT_YOURS` if none of the parent's
children was on that trip, or the trip is not finished.

### Trail

`GET /trips/:id/trail` (driver of the van, parent of a child on the trip,
school admin/staff of that school, superadmin). Existing fields kept
(`polyline`, `points` = count); new:

```json
{ "path": [{ "lat": 24.9, "lng": 67.1, "t": "2026-10-15T02:00:04.000Z" }],
  "start": { "lat": 24.9, "lng": 67.1, "t": "…" }, "end": { "lat": 24.86, "lng": 67.0, "t": "…" },
  "endedAt": "ISO|null" }
```

`path` is simplified (Douglas-Peucker) to at most 1000 points, keeping the
first and last. For finished trips a parent must have a child on the trip
(sharing only the van is no longer enough).

## 8. SOS → WhatsApp to parents (Oct 15)

When a driver sends `POST /alert/sos`, after the ADMIN
alert is saved the server also sends a WhatsApp **template** to the parents of
the kids on the driver's active trip (fallback: kids on the van's routes that
run today). The SOS response does not wait for it. FCM push and the admin
socket alert are unchanged.

Uses the approved WABA template `smartvan_sos` (English, utility):
"Alert regarding {{1}} on van {{2}}. Contact number: {{3}}. Please respond immediately."
Body parameters, in order: `{{1}}` the parent's child name(s) (comma-separated
if several, or if parents share a number) · `{{2}}` van number · `{{3}}` the
school's contact number (fallback: driver's phone), as +92…. One message per
parent, so each only sees their own child's name.

Env: `SOS_WHATSAPP_ENABLED` (default `false`; set `true` to turn on),
`WHATSAPP_SOS_TEMPLATE` (default `smartvan_sos`),
`WHATSAPP_SOS_TEMPLATE_LANG` (default `en`).

Phones are normalized to E.164 (`03001234567` → `+923001234567`) and
de-duplicated. At most one batch per trip (or per van if the SOS has no trip)
per 5 minutes; a second SOS inside the window is saved with
`whatsappSkipped: "throttled"`.

Result saved on the alert (notification) document:

```json
{ "tripId": "…", "whatsappBatchAt": "2026-10-15T03:42:00.000Z",
  "whatsappNotifications": [
    { "parentId": "…", "phone": "+923001234567", "status": "sent", "messageId": "wamid.HBg…", "sentAt": "ISO" },
    { "parentId": "…", "phone": "+923009999999", "status": "failed", "error": "Template not approved", "sentAt": "ISO" },
    { "parentId": "…", "phone": "", "status": "failed", "error": "invalid_phone", "sentAt": "ISO" }
  ] }
```

`whatsappSkipped` is `throttled` or `no_recipients` when nothing was sent.
Full numbers are stored on the alert but never written to logs (masked as
`+92300***4567`).
