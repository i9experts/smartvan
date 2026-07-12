const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient('mongodb+srv://waliiqbal2020:QwXfF6vnGHPDih1W@cluster0.gqktgu9.mongodb.net/smartvan?retryWrites=true&w=majority');
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
