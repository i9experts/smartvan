const b = require('bcrypt');
const m = require('mongoose');
if (!process.env.MONGODB_URI) { console.error('Set MONGODB_URI first, e.g. MONGODB_URI="mongodb+srv://..." node <script>'); process.exit(1); }
m.connect(process.env.MONGODB_URI).then(async () => {
  const all = await m.connection.db.collection('admins').find({}, {projection:{email:1,role:1}}).toArray();
  console.log('Admins in smartvan DB:', JSON.stringify(all));
  const hash = await b.hash('Admin@123', 10);
  const r = await m.connection.db.collection('admins').updateMany({}, { $set: { password: hash } });
  console.log('Updated:', r.modifiedCount);
  process.exit();
});
