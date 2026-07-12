require('dotenv').config();
const { MongoClient } = require('mongodb');

function formatPhone(phone) {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
  if (!cleaned.startsWith('92') && !cleaned.startsWith('971') && !cleaned.startsWith('966') && !cleaned.startsWith('974')) {
    cleaned = '92' + cleaned;
  }
  return cleaned;
}

async function sendSchoolWelcome(to, contactPerson, schoolName) {
  const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: formatPhone(to),
      type: 'template',
      template: {
        name: 'smartvan_welcome',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: contactPerson },
            { type: 'text', text: schoolName },
          ],
        }],
      },
    }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb+srv://waliiqbal2020:QwXfF6vnGHPDih1W@cluster0.gqktgu9.mongodb.net/smartvan?retryWrites=true&w=majority');
  await client.connect();
  const db = client.db('smartvan');

  const schools = await db.collection('schools').find({ status: 'active' }).toArray();

  for (const school of schools) {
    if (!school.contactNumber) {
      console.log(`Skipping ${school.schoolName} — no phone number`);
      continue;
    }
    try {
      const result = await sendSchoolWelcome(school.contactNumber, school.contactPerson, school.schoolName);
      console.log(`${school.schoolName} → status ${result.status}:`, JSON.stringify(result.data));
    } catch (err) {
      console.log(`${school.schoolName} → ERROR:`, err.message);
    }
  }

  await client.close();
}

run().catch(console.error);
