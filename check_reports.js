const { MongoClient } = require('mongodb');
if (!process.env.MONGODB_URI) { console.error('Set MONGODB_URI first, e.g. MONGODB_URI="mongodb+srv://..." node <script>'); process.exit(1); }

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('smartvan');

  const reports = await db.collection('reports').find({}).limit(5).toArray();
  for (const r of reports) {
    console.log(`${r._id} | ${r.issueType} | status: ${r.status} | schoolId: ${r.schoolId}`);
  }

  await client.close();
}

run().catch(console.error);
