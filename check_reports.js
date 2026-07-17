const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient('mongodb+srv://waliiqbal2020:QwXfF6vnGHPDih1W@cluster0.gqktgu9.mongodb.net/smartvan?retryWrites=true&w=majority');
  await client.connect();
  const db = client.db('smartvan');

  const reports = await db.collection('reports').find({}).limit(5).toArray();
  for (const r of reports) {
    console.log(`${r._id} | ${r.issueType} | status: ${r.status} | schoolId: ${r.schoolId}`);
  }

  await client.close();
}

run().catch(console.error);
