const b = require('bcrypt');
const m = require('mongoose');
m.connect('mongodb+srv://waliiqbal2020:QwXfF6vnGHPDih1W@cluster0.gqktgu9.mongodb.net/smartvan').then(async () => {
  const all = await m.connection.db.collection('admins').find({}, {projection:{email:1,role:1}}).toArray();
  console.log('Admins in smartvan DB:', JSON.stringify(all));
  const hash = await b.hash('Admin@123', 10);
  const r = await m.connection.db.collection('admins').updateMany({}, { $set: { password: hash } });
  console.log('Updated:', r.modifiedCount);
  process.exit();
});
