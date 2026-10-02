const { MongoClient } = require('mongodb');
if (!process.env.MONGODB_URI) { console.error('Set MONGODB_URI first, e.g. MONGODB_URI="mongodb+srv://..." node <script>'); process.exit(1); }

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('smartvan');

  const school = await db.collection('schools').findOne({ status: 'active' });
  if (!school) {
    console.log('No active school found');
    await client.close();
    return;
  }

  const result = await db.collection('reports').insertOne({
    schoolId: school._id.toString(),
    status: 'pending',
    issueType: 'Van Arrived Late',
    description: 'Test ticket created to verify the Employee ticket queue end-to-end.',
    dateOfIncident: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log('School:', school.schoolName);
  console.log('Report created:', result.insertedId.toString());

  await client.close();
}

run().catch(console.error);
