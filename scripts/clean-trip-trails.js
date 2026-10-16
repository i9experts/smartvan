#!/usr/bin/env node
/**
 * Cleans old trips' trails. DRY RUN unless --apply.
 *
 *   npm run build
 *   MONGODB_URI=... node scripts/clean-trip-trails.js                 # all finished trips, dry run
 *   MONGODB_URI=... node scripts/clean-trip-trails.js --trip <id>     # one trip
 *   MONGODB_URI=... node scripts/clean-trip-trails.js --since 2026-10-01
 *   MONGODB_URI=... node scripts/clean-trip-trails.js --trip <id> --apply
 *
 * The original `locations` and `distanceMeters` are NEVER changed or deleted.
 * With --apply the cleaned trail goes to `locationsCleaned`, the cleaned
 * distance to `distanceMetersCleaned` and the time to `cleanedAt`; the trail
 * endpoint and trip history prefer those fields when they exist. To undo:
 *   db.trips.updateMany({}, { $unset: { locationsCleaned: 1, distanceMetersCleaned: 1, cleanedAt: 1 } })
 * Only trips where cleaning removes at least one point are touched.
 * MONGODB_URI comes from your own environment and is never printed.
 */
const path = require('path');
const mongoose = require('mongoose');

let cleanTrail;
try { ({ cleanTrail } = require(path.join(__dirname, '..', 'dist', 'Trip', 'trail-clean.util'))); }
catch { console.error('Run "npm run build" first (this script uses dist/).'); process.exit(1); }

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const apply = flag('--apply');
const tripArg = val('--trip');
const since = val('--since');
if (!process.env.MONGODB_URI) { console.error('Set MONGODB_URI in your environment first.'); process.exit(1); }
if (tripArg && !/^[a-f0-9]{24}$/i.test(tripArg)) { console.error('--trip needs a 24-character trip id'); process.exit(1); }
if (since && isNaN(new Date(since))) { console.error('--since needs a date like 2026-10-01'); process.exit(1); }

const km = (m) => ((m || 0) / 1000).toFixed(2);

(async () => {
  try { await mongoose.connect(process.env.MONGODB_URI); }
  catch (e) { console.error('Could not connect to the database (' + (e.name || 'error') + ').'); process.exit(1); }
  try {
    const col = mongoose.connection.db.collection('trips');
    const filter = tripArg
      ? { _id: new mongoose.Types.ObjectId(tripArg) }
      : { status: 'end', ...(since ? { createdAt: { $gte: new Date(since) } } : {}) };
    const cursor = col.find(filter, { projection: { locations: 1, distanceMeters: 1, distanceMetersCleaned: 1, tripStart: 1, type: 1, routeId: 1 } });

    console.log(apply ? '*** APPLY: writing cleaned fields (originals untouched) ***' : 'DRY RUN (nothing is written; add --apply to write)');
    console.log('trip                      pts before → after   km before → after   changed');
    let seen = 0, changed = 0, written = 0;
    for await (const trip of cursor) {
      seen++;
      const before = (trip.locations || []).length;
      if (before < 3) continue;
      const r = cleanTrail(trip.locations);
      const removed = before - r.kept.length;
      const note = removed > 0 ? 'YES' : 'no';
      if (removed > 0 || tripArg) {
        console.log(`${trip._id}  ${String(before).padStart(5)} → ${String(r.kept.length).padEnd(6)}   ${km(trip.distanceMeters).padStart(7)} → ${km(r.distanceMeters).padEnd(7)}   ${note}`);
      }
      if (removed <= 0) continue;
      changed++;
      if (apply) {
        await col.updateOne({ _id: trip._id }, {
          $set: {
            locationsCleaned: r.kept.map((p) => ({ lat: p.lat, long: p.long, time: p.time })),
            distanceMetersCleaned: r.distanceMeters,
            cleanedAt: new Date(),
          },
        });
        written++;
      }
    }
    console.log(`\nTrips looked at: ${seen}   would change: ${changed}   written: ${written}${apply ? '' : '   (dry run)'}`);
  } finally {
    await mongoose.disconnect();
  }
})().catch((e) => { console.error('Failed: ' + (e && e.name ? e.name : 'error')); process.exit(1); });
