// Read-only diagnostic — does NOT modify anything.
// Usage: MONGODB_URI="<paste from Railway Variables>" node verify_admins.js
if (!process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI first, e.g. MONGODB_URI="mongodb+srv://..." node verify_admins.js');
  process.exit(1);
}
const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(); // uses the db name embedded in the URI
  console.log('Connected to database:', db.databaseName);

  const admins = await db.collection('admins').find({}, { projection: { email: 1, role: 1, password: 1 } }).toArray();
  console.log(`Found ${admins.length} admin account(s):`);
  for (const a of admins) {
    console.log(`  - ${a.email} | role: ${a.role} | password hash present: ${!!a.password} (len ${a.password ? a.password.length : 0})`);
  }

  const schoolCount = await db.collection('schools').countDocuments();
  console.log(`schools collection has ${schoolCount} document(s)`);

  await client.close();
}

run().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
