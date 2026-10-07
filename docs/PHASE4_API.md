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
