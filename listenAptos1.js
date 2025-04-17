import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

// --- Configuration ---
const network = Network.MAINNET;
const aptos = new Aptos(new AptosConfig({ network }));

// Pad address to 64 hex characters (excluding 0x)
const rawAddress = "611b75fc39f8103eaaf3105ee4805fb23c00881d5022fcf963d982596e643c20";
const monitoredAccount = "0x" + rawAddress.padStart(64, "0");

const dbFilePath = "./aptos_transactions.db";
const BATCH_SIZE = 10;

// --- SQLite Table Schemas ---
const createTxTableSql = `
CREATE TABLE IF NOT EXISTS aptos_transaction_details (
    version TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    fetched_at TEXT DEFAULT (datetime('now')),
    sender TEXT,
    amount TEXT,
    raw_transaction TEXT
);`;

const createOffsetTableSql = `
CREATE TABLE IF NOT EXISTS aptos_offset_tracker (
    address TEXT PRIMARY KEY,
    offset INTEGER DEFAULT 0
);`;

// --- Open or Create SQLite DB ---
async function openDb() {
  const db = await open({ filename: dbFilePath, driver: sqlite3.Database });
  await db.exec(createTxTableSql);
  await db.exec(createOffsetTableSql);
  return db;
}

// --- Get Stored Offset ---
async function getStoredOffset(db, address) {
  const row = await db.get(`SELECT offset FROM aptos_offset_tracker WHERE address = ?`, [address]);
  return row ? row.offset : 0;
}

// --- Update Offset ---
async function updateOffset(db, address, newOffset) {
  await db.run(
    `INSERT INTO aptos_offset_tracker (address, offset)
     VALUES (?, ?)
     ON CONFLICT(address) DO UPDATE SET offset = excluded.offset`,
    [address, newOffset]
  );
}

// --- Extract Sender and Amount ---
function extractTransactionData(tx) {
  const sender = tx.sender || null;
  let amount = null;
  if (tx.payload?.arguments && tx.payload.arguments.length >= 2) {
    amount = tx.payload.arguments[1]; // Commonly amount is at index 1
  }
  return { sender, amount };
}

// --- Store a Transaction in SQLite ---
async function storeTransaction(tx, db) {
  const { sender, amount } = extractTransactionData(tx);
  const raw_transaction = JSON.stringify(tx);
  const sql = `
    INSERT INTO aptos_transaction_details (version, network, sender, amount, raw_transaction)
    VALUES (?, ?, ?, ?, ?)`;
  const params = [
    tx.version.toString(),
    network,
    sender,
    amount,
    raw_transaction,
  ];

  try {
    await db.run(sql, params);
    console.log(`✅ Stored tx version ${tx.version}, sender: ${sender}, amount: ${amount}`);
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT") {
      console.warn(`⚠️  Tx version ${tx.version} already exists. Skipping.`);
    } else {
      console.error("❌ Error inserting transaction:", err);
    }
  }
}

// --- Main Function to Fetch & Store Transactions ---
async function fetchAndStoreTransactions() {
  const db = await openDb();

  try {
    const offset = await getStoredOffset(db, monitoredAccount);

    const transactions = await aptos.getAccountTransactions({
      accountAddress: monitoredAccount,
      options: { offset, limit: BATCH_SIZE },
    });

    console.log(`🔍 Fetched ${transactions.length} txs from offset ${offset}`);

    for (const tx of transactions) {
      await storeTransaction(tx, db);
    }

    const newOffset = offset + transactions.length;
    await updateOffset(db, monitoredAccount, newOffset);
    console.log(`📝 Updated offset to ${newOffset}`);
  } catch (error) {
    console.error("❌ Error during fetch/store:", error);
  } finally {
    await db.close();
  }
}

// --- Run (for cron job) ---
fetchAndStoreTransactions();
