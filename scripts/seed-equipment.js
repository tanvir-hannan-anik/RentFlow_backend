import { readFile } from 'node:fs/promises';
import { BSON } from 'mongodb';
import { connectDatabase, closeDatabase } from '../src/config/database.js';
try {
  const db = await connectDatabase();
  const items = BSON.EJSON.parse(await readFile(new URL('../data/equipment.json', import.meta.url), 'utf8'));
  // Only insert missing sample IDs. Never overwrite existing documents.
  const result = await db.collection('equipment').bulkWrite(items.map(({ _id, ...item }) => ({ updateOne: { filter: { _id }, update: { $setOnInsert: item }, upsert: true } })));
  console.log(`Added ${result.upsertedCount} sample listings; existing records were preserved.`);
} catch { console.error('Sample import failed. Check your database configuration and write permissions.'); process.exitCode = 1; }
finally { await closeDatabase(); }
