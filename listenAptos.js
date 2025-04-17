// aptos_tx_logger.ts
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

// --- Configuration ---
const network = Network.MAINNET;
const aptos = new Aptos(new AptosConfig({ network }));
const monitoredAccount = "0x611b75fc39f8103eaaf3105ee4805fb23c00881d5022fcf963d982596e643c20";
const dbFilePath = "./aptos_transactions.db";

// --- SQLite Table Schema ---
const createTableSql = `
CREATE TABLE IF NOT EXISTS aptos_transaction_details (
    version TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    fetched_at TEXT DEFAULT (datetime('now')),
    sender TEXT,
    amount TEXT,
    raw_transaction TEXT
);`;

// --- Open or Create SQLite DB ---
async function openDb() {
  const db = await open({ filename: dbFilePath, driver: sqlite3.Database });
  await db.exec(createTableSql);
  return db;
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
    VALUES ($version, $network, $sender, $amount, $raw_transaction)
  `;
  const params = {
    $version: tx.version.toString(),
    $network: network,
    $sender: sender,
    $amount: amount,
    $raw_transaction: raw_transaction,
  };

  try {
    const result = await db.run(sql, params);
    console.log(`Stored tx version ${tx.version}, sender: ${sender}, amount: ${amount}`);
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT") {
      console.warn(`Transaction version ${tx.version} already exists. Skipping.`);
    } else {
      console.error("Error inserting transaction:", err);
    }
  }
}

// --- Fetch and Store Latest Transactions ---
async function fetchAndStoreLatestTransactions() {
  const db = await openDb();
  try {
    const transactions = await aptos.getAccountTransactions({
      // accountAddress: monitoredAccount
      accountAddress: monitoredAccount,
      options: { offset: 0, limit: 10 },
    });

    for (const tx of transactions) {
      await storeTransaction(tx, db);
    }
  } catch (error) {
    console.error("Error fetching/storing Aptos transactions:", error);
  } finally {
    await db.close();
  }
}

// --- Run ---
fetchAndStoreLatestTransactions();
