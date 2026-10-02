const { MongoClient } = require('mongodb');
if (!process.env.MONGODB_URI) { console.error('Set MONGODB_URI first, e.g. MONGODB_URI="mongodb+srv://..." node <script>'); process.exit(1); }

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('smartvan');

  const schools = await db.collection('schools').find({}).toArray();
  for (const s of schools) {
    console.log(`${s.schoolName} | contact: ${s.contactPerson} | phone: ${s.contactNumber} | status: ${s.status}`);
  }

  await client.close();
}

run().catch(console.error);
