 This is a small Node .js “listener” project whose goal is to pull on‑chain data from two non‑EVM chains (Aptos and Sui), parse out the bits
    you care about (sender, amount, event type, etc.), and stash them into local SQLite databases so you can process or inspect them later.

    High‑level structure:

        * package.json
          • name: non‑evm‑listener‑project
          • deps:
            – @aptos‑labs/ts‑sdk & aptos (for talking to Aptos)
            – @mysten/sui (for talking to Sui)
            – sqlite & sqlite3 (to persist into .db files)
            – ethers, mongodb, mysql2, pg, ws, etc. (installed but not yet wired up)
          • scripts: start and dev point at a missing src/app.js (probably a placeholder)
        * listenAptos.js
          • fetches the latest 10 transactions for a hard‑coded Aptos account
          • extracts sender & amount (where arguments[1] is “amount”)
          • writes each tx into aptos_transaction_details in aptos_transactions.db
        * listenAptos1.js
          • same as above but keeps a simple “offset” in a second table so you can resume where you left off
          • batches 10 at a time, updates offset
        * listenSui.js
          • given a single transaction digest, fetches that tx’s block (with showEvents: true)
          • pretty‑prints any events it emitted
        * listenSui1.js
          • polls Sui for all events emitted by a particular sender address (using queryEvents + a cursor)
          • extracts sender, amount (if any), event type, etc.
          • writes each into sui_transaction_events in sui_event_logs.db
          • tracks the last cursor in sui_event_cursor so you can page forward

    You end up with two local SQLite files—aptos_transactions.db and sui_event_logs.db—that store everything you’ve seen so far. It’s basically
    a proof‑of‑concept or boilerplate for building a non‑EVM on‑chain indexing pipeline. From here you might:

        * Swap SQLite out for Postgres/Mongo/MySQL (those drivers are already installed)
        * Hook these scripts up to a cron or a long‑running process (or WebSocket) for real‑time ingestion
        * Expose a REST API or push changes into a downstream analytics system