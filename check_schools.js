const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient('mongodb+srv://waliiqbal2020:QwXfF6vnGHPDih1W@cluster0.gqktgu9.mongodb.net/smartvan?retryWrites=true&w=majority');
  await client.connect();
  const db = client.db('smartvan');

  const schools = await db.collection('schools').find({}).toArray();
  for (const s of schools) {
    console.log(`${s.schoolName} | contact: ${s.contactPerson} | phone: ${s.contactNumber} | status: ${s.status}`);
  }

  await client.close();
}

run().catch(console.error);
