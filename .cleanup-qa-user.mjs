import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.DATABASE_NAME || 'rentflow');
console.log('before sessions', await db.collection('session').countDocuments());
console.log('qa sessions', await db.collection('session').countDocuments({ userId: '6b0267659655933dd2a24c7f' }));
console.log('session by id', await db.collection('session').countDocuments({ _id: '6b0267659655933dd2a24c81' }));
console.log('accounts qa', await db.collection('account').countDocuments({ userId: '6b0267659655933dd2a24c7f' }));
const s = await db.collection('session').deleteMany({ userId: '6b0267659655933dd2a24c7f' });
const a = await db.collection('account').deleteMany({ userId: '6b0267659655933dd2a24c7f' });
console.log('deleted', JSON.stringify({ s, a }));
console.log('after sessions', await db.collection('session').countDocuments());
await client.close();
