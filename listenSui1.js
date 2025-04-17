import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// --- Configuration ---
const network = 'mainnet';
const rpcUrl = getFullnodeUrl(network);
const suiClient = new SuiClient({ url: rpcUrl });

const monitoredAddress = '0x0feb54a725aa357ff2f5bc6bb023c05b310285bd861275a30521f339a434ebb3';
const dbFilePath = './sui_event_logs.db';
const BATCH_SIZE = 10;

// --- SQLite Table Schemas ---
const createEventTableSql = `
CREATE TABLE IF NOT EXISTS sui_transaction_events (
    id TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    fetched_at TEXT DEFAULT (datetime('now')),
    sender TEXT,
    amount TEXT,
    event_type TEXT,
    raw_event TEXT
);`;

const createCursorTableSql = `
CREATE TABLE IF NOT EXISTS sui_event_cursor (
    address TEXT PRIMARY KEY,
    cursor TEXT DEFAULT null
);`;

// --- Open or Create SQLite DB ---
async function openDb() {
  const db = await open({ filename: dbFilePath, driver: sqlite3.Database });
  await db.exec(createEventTableSql);
  await db.exec(createCursorTableSql);
  return db;
}

// --- Get Last Cursor ---
async function getLastCursor(db, address) {
  const row = await db.get(`SELECT cursor FROM sui_event_cursor WHERE address = ?`, [address]);
  if (row?.cursor) {
    try {
      return JSON.parse(row.cursor);
    } catch (e) {
      console.error('❌ Failed to parse cursor. Resetting. Raw value:', row.cursor);
      return null;
    }
  }
  return null;
}

// --- Update Cursor ---
async function updateCursor(db, address, newCursor) {
  try {
    const serialized = JSON.stringify(newCursor);
    await db.run(
      `INSERT INTO sui_event_cursor (address, cursor)
       VALUES (?, ?)
       ON CONFLICT(address) DO UPDATE SET cursor = excluded.cursor`,
      [address, serialized]
    );
  } catch (e) {
    console.error('❌ Failed to store cursor:', e);
  }
}

// --- Extract Sender and Amount from Event ---
function extractEventData(event) {
  const sender = event?.sender || null;
  let amount = null;

  try {
    const parsed = event?.parsedJson;

    if (parsed?.executed_quantity && parsed.executed_quantity !== '0') {
      amount = parsed.executed_quantity.toString();
    } else if (parsed?.original_quantity) {
      amount = parsed.original_quantity.toString();
    }
  } catch (err) {
    amount = null;
  }

  return {
    id: event.id?.txDigest + '_' + event.id?.eventSeq,
    sender,
    amount,
    event_type: event.type,
    raw_event: JSON.stringify(event)
  };
}

// --- Store Event in SQLite ---
async function storeEvent(event, db) {
  const { id, sender, amount, event_type, raw_event } = extractEventData(event);
  const sql = `
    INSERT INTO sui_transaction_events (id, network, sender, amount, event_type, raw_event)
    VALUES (?, ?, ?, ?, ?, ?)`;

  const params = [id, network, sender, amount, event_type, raw_event];

  try {
    await db.run(sql, params);
    console.log(`✅ Stored event: ${id}, sender: ${sender}, amount: ${amount}`);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT') {
      console.warn(`⚠️  Event ${id} already exists. Skipping.`);
    } else {
      console.error("❌ Error inserting event:", err);
    }
  }
}

// --- Main Fetcher ---
async function fetchAndStoreEvents() {
  const db = await openDb();
  try {
    const cursor = await getLastCursor(db, monitoredAddress);
    console.log('📍 Current cursor:', cursor);

    const response = await suiClient.queryEvents({
      query: { Sender: monitoredAddress },
      limit: BATCH_SIZE,
      cursor
    });

    console.log(`🔍 Fetched ${response.data.length} events`);

    for (const event of response.data) {
      await storeEvent(event, db);
    }

    if (response.hasNextPage && response.nextCursor) {
      await updateCursor(db, monitoredAddress, response.nextCursor);
      console.log(`📝 Updated cursor to`, response.nextCursor);
    } else {
      console.log("✅ No more pages to fetch.");
    }
  } catch (error) {
    console.error("❌ Error during event fetch/store:", error);
  } finally {
    await db.close();
  }
}

// --- Run Script ---
fetchAndStoreEvents();
