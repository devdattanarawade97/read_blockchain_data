import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

// --- Configuration ---
// Use 'mainnet', 'testnet', 'devnet', or a custom RPC URL where the transaction occurred
const network= 'mainnet';
const rpcUrl = getFullnodeUrl(network);

// ** IMPORTANT: Replace this with the actual digest of the transaction you want to inspect **
const transactionDigestToInspect = 'FyudUQog69rLkqp8gaFcJMAnQXwVpGK8UsJ9MM5BmNHU';
// Example format: 'A1b2C3d4E5f6G7h8i9J0kLmNoPqRsTuVwXyZaBcDeFgH' (length varies)


// --- Connection ---
const client = new SuiClient({ url: rpcUrl });



// --- Function to Fetch and Log Events ---
async function getEventsForSpecificTransaction(digest) {
  if (!digest || digest === 'PUT_THE_TRANSACTION_DIGEST_HERE') {
      console.error("Error: Please replace 'PUT_THE_TRANSACTION_DIGEST_HERE' with an actual transaction digest.");
      return;
  }

  console.log(`Connecting to Sui ${network} RPC: ${rpcUrl}`);
  console.log(`Workspaceing details for transaction digest: ${digest}`);

  try {
    // Fetch the transaction block details
    // Crucially, set 'showEvents: true' in the options
    const txDetails = await client.getTransactionBlock({
      digest: digest,
      options: {
        showInput: false,    // Don't need input details for this task
        showEffects: true,   // Effects can be useful context (status, gas)
        showEvents: true,    // <<< This is the essential part
        showObjectChanges: false, // Don't need object changes for this task
        showBalanceChanges: false,// Don't need balance changes for this task
      },
    });

    console.log('\n--- Transaction Found ---');
    console.log('Status:', txDetails.effects?.status.status); // Show if it succeeded or failed

    // Check if events exist in the response
    if (txDetails.events && txDetails.events.length > 0) {
      console.log(`\n--- Events for Transaction ${digest} ---`);
      console.log(JSON.stringify(txDetails.events, null, 2)); // Pretty print the events array
    } else if (txDetails.effects?.status.status === 'success') {
       console.log(`\n--- Events for Transaction ${digest} ---`);
       console.log('No events were emitted by this transaction.');
    } else {
         console.log(`\n--- Events for Transaction ${digest} ---`);
         console.log('Transaction failed, no events were emitted (or transaction not found/finalized).');
         if (txDetails.effects?.status.error) {
            console.error('Error:', txDetails.effects.status.error);
         }
    }

  } catch (error) {
    console.error(`\n--- Error fetching transaction ${digest} ---`);
    if (error instanceof Error && error.message.includes('Could not find the referenced transaction digest')) {
        console.error(`Error: Transaction digest "${digest}" not found on the ${network} network.`);
        console.error(`Please ensure:\n1. The digest is correct.\n2. You are connected to the correct network (${network}).\n3. The transaction has been finalized.`);
    } else {
        console.error(error); // Log other potential errors (network issues, etc.)
    }
  }
}

// --- Execute the function ---
getEventsForSpecificTransaction(transactionDigestToInspect);