#!/usr/bin/env node
/**
 * READ-ONLY. Explains why one trip's trail looks like a scribble.
 *
 *   npm run build            # once, the script uses the compiled filters
 *   MONGODB_URI=... node scripts/diagnose-trip-trail.js <tripId>
 *
 * MONGODB_URI comes from your own environment and is never printed.
 * Nothing is written to the database.
 */
const path = require('path');
const mongoose = require('mongoose');

function load(rel) {
  try { return require(path.join(__dirname, '..', 'dist', rel)); }
  catch { console.error('Run "npm run build" first (this script uses dist/).'); process.exit(1); }
}
const { haversineMeters, impliedSpeedKmh, MAX_SPEED_KMH, MAX_ACCURACY_METERS } = load('Trip/location-guard.util');
const { cleanTrail } = load('Trip/trail-clean.util');

const tripId = process.argv[2];
if (!tripId || !/^[a-f0-9]{24}$/i.test(tripId)) { console.error('Usage: node scripts/diagnose-trip-trail.js <tripId>'); process.exit(1); }
if (!process.env.MONGODB_URI) { console.error('Set MONGODB_URI in your environment first.'); process.exit(1); }

const fmt = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) + 'Z' : '—');
const km = (m) => (m / 1000).toFixed(2) + ' km';
const pad = (s, n) => String(s).padEnd(n);

function bbox(pts) {
  const lat = pts.map((p) => p.lat), lng = pts.map((p) => p.long);
  return `lat ${Math.min(...lat).toFixed(4)}..${Math.max(...lat).toFixed(4)}, lng ${Math.min(...lng).toFixed(4)}..${Math.max(...lng).toFixed(4)}`;
}

/** ~550 m grid cells → who sits where. */
function cells(pts) {
  const m = new Map();
  pts.forEach((p, i) => {
    const key = `${Math.round(p.lat * 200) / 200},${Math.round(p.long * 200) / 200}`;
    const c = m.get(key) || { key, n: 0, first: p.time, last: p.time, entries: 0, lastIdx: -10 };
    if (i - c.lastIdx > 1) c.entries++; // how often the trail jumped INTO this cell
    c.n++; c.last = p.time; c.lastIdx = i;
    m.set(key, c);
  });
  return [...m.values()].sort((a, b) => b.n - a.n);
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
  } catch (e) { console.error('Could not connect to the database (' + (e.name || 'error') + ').'); process.exit(1); }
  try {
    const col = mongoose.connection.db.collection('trips');
    const trip = await col.findOne({ _id: new mongoose.Types.ObjectId(tripId) });
    if (!trip) { console.error('Trip not found.'); return; }
    const locs = (trip.locations || []).filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.long));

    console.log(`\nTrip ${tripId}  type=${trip.type}  status=${trip.status}`);
    console.log(`Started ${fmt(trip.tripStart && trip.tripStart.startTime)}  Ended ${fmt(trip.tripEnd && trip.tripEnd.endTime)}`);
    console.log(`Stored distance ${km(trip.distanceMeters || 0)}   points ${locs.length}   tracking session: ${trip.trackingSession ? trip.trackingSession.sessionId + ' (device ' + (trip.trackingSession.deviceId || '?') + ')' : 'none'}`);
    if (!locs.length) return;

    // 1. Sources
    const withIds = locs.filter((l) => l.deviceId || l.sessionId);
    console.log('\n── 1. Sources (deviceId / sessionId stored on each point) ──');
    if (!withIds.length) {
      console.log('No point carries a deviceId or sessionId (all written by an app/server version before this fix).');
      console.log('Using clusters and jumps instead (sections 2 and 3).');
    } else {
      const groups = new Map();
      for (const l of locs) {
        const k = `${l.deviceId || '(none)'}  /  ${l.sessionId || '(none)'}`;
        const g = groups.get(k) || [];
        g.push(l); groups.set(k, g);
      }
      for (const [k, g] of groups) {
        const t = g.map((x) => +new Date(x.time)).filter(Number.isFinite);
        console.log(`${pad(g.length + ' pts', 9)} ${k}\n          ${fmt(Math.min(...t))} → ${fmt(Math.max(...t))}   ${bbox(g)}`);
      }
      if (groups.size > 1) console.log('→ MORE THAN ONE source wrote this trip.');
    }

    // 2. Jumps in insert order
    console.log('\n── 2. Jumps between consecutive stored points (insert order) ──');
    let jumps = 0, inv = 0, implied = 0, bigSegs = 0, rawDist = 0;
    const worst = [];
    for (let i = 1; i < locs.length; i++) {
      const a = locs[i - 1], b = locs[i];
      const d = haversineMeters(a.lat, a.long, b.lat, b.long);
      rawDist += d;
      if (d > 2000) bigSegs++;
      if (d > 500) { jumps++; worst.push({ i, d, a, b }); }
      if (a.time && b.time && new Date(b.time) < new Date(a.time)) inv++;
      if (a.time && b.time && impliedSpeedKmh({ lat: a.lat, long: a.long, time: new Date(a.time) }, { lat: b.lat, long: b.long, time: new Date(b.time) }) > MAX_SPEED_KMH) implied++;
    }
    console.log(`Jumps over 500 m: ${jumps}   over 2 km: ${bigSegs}   implied speed > ${MAX_SPEED_KMH} km/h: ${implied}   out-of-time-order: ${inv}`);
    console.log(`Sum of every segment: ${km(rawDist)} (stored distance ignores segments over 2 km)`);
    worst.sort((x, y) => y.d - x.d).slice(0, 5).forEach((w) =>
      console.log(`  #${w.i}: ${(w.d / 1000).toFixed(2)} km  ${fmt(w.a.time)} (${w.a.lat.toFixed(4)},${w.a.long.toFixed(4)}) → ${fmt(w.b.time)} (${w.b.lat.toFixed(4)},${w.b.long.toFixed(4)})`));
    const inaccurate = locs.filter((l) => l.accuracy > MAX_ACCURACY_METERS).length;
    if (inaccurate) console.log(`Points with accuracy > ${MAX_ACCURACY_METERS} m: ${inaccurate}`);

    // 3. Clusters
    console.log('\n── 3. Busiest ~550 m cells (a parked phone = one cell the trail keeps jumping back into) ──');
    for (const c of cells(locs).slice(0, 6)) {
      console.log(`  ${pad(c.key, 18)} ${pad(c.n + ' pts', 9)} jumped into ${c.entries}×   ${fmt(c.first)} → ${fmt(c.last)}`);
    }
    const top = cells(locs)[0];
    if (top && top.entries > 20) console.log(`→ Cell ${top.key} was re-entered ${top.entries} times: points alternate between it and somewhere else — typical of a second, stationary source.`);

    // 4. What the cleanup would do
    const r = cleanTrail(locs);
    console.log('\n── 4. What cleaning would keep (same filters as live points) ──');
    console.log(`Points ${locs.length} → ${r.kept.length}   distance ${km(trip.distanceMeters || 0)} → ${km(r.distanceMeters)}   (insert-order inversions: ${r.insertOrderInversions})`);
    if (r.kept.length) console.log(`Kept trail: ${bbox(r.kept)}`);
    console.log('\n(Read-only: nothing was changed.)');
  } finally {
    await mongoose.disconnect();
  }
})().catch((e) => { console.error('Failed: ' + (e && e.name ? e.name : 'error')); process.exit(1); });
