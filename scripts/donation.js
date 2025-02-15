const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ========== CONFIGURATION ==========

// RPC endpoint
const uniRpcUrl = 'https://mainnet.unichain.org/';

// Token contract address
const tokenAddress = '0xa84A8Acc04CD47e18bF5Af826aB00D5026552EA5';

// Donation wallet address
const donationWallet = '0xb321c8668af574F94AEa328593557885ec8141C8';

// The starting block to scan from
let lastScannedBlock = 8533484;

// Where we'll store donation info
// 1) Using process.cwd() to create a path in the working directory (often the project root)
const DONATIONS_FILE = path.join(process.cwd(), 'donations.json');


// ERC-20 ABI
const erc20Abi = [
  'function totalSupply() external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];

// ========== PROVIDER & CONTRACT SETUP ==========

const provider = new ethers.providers.JsonRpcProvider(uniRpcUrl);
const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);

// Variables to store the last recorded supply and donation balance
let lastSupply = null;
let lastDonationBalance = null;

// ========== DONATIONS FILE HELPER FUNCTIONS ==========

/**
 * Load the existing donations from a JSON file.
 * If the file doesn't exist or is invalid, return an empty array.
 */
function loadDonations() {
  try {
    const data = fs.readFileSync(DONATIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // File not found or invalid JSON
    return [];
  }
}

/**
 * Write the donation array to a JSON file (overwrites existing).
 */
function saveDonations(donations) {
  fs.writeFileSync(DONATIONS_FILE, JSON.stringify(donations, null, 2));
}

// ========== SCAN FOR NEW TRANSFER EVENTS ==========

/**
 * Queries Transfer events from `lastScannedBlock` up to the latest block.
 * If the `to` address is `donationWallet`, records the event in `donations.json`.
 */
async function scanNewTransfers() {
  try {
    const currentBlock = await provider.getBlockNumber();

    // If we've gone past the current block, nothing to do yet
    if (lastScannedBlock > currentBlock) {
      return;
    }

    // Build a filter for Transfer -> donationWallet
    const filter = tokenContract.filters.Transfer(null, donationWallet);

    // Query logs from lastScannedBlock -> currentBlock
    const events = await tokenContract.queryFilter(filter, lastScannedBlock, currentBlock);

    if (events.length > 0) {
      // Load existing donations
      const donations = loadDonations();

      // Get the current "acummulatedAmount" from the last donation (if any)
      let lastCumulative = ethers.BigNumber.from("0");
      if (donations.length > 0) {
        const lastEntry = donations[donations.length - 1];
        // If the last entry already had a cumulative amount, parse it
        if (lastEntry.acummulatedAmount) {
          lastCumulative = ethers.utils.parseUnits(lastEntry.acummulatedAmount, 18);
        } else {
          // Otherwise, parse the "amount" field
          lastCumulative = ethers.utils.parseUnits(lastEntry.amount, 18);
        }
      }

      // Process each new event
      for (const event of events) {
        const { args } = event;
        const from = args[0];
        const to = args[1];
        const value = args[2]; // BigNumber

        // Single donation amount in decimal form (string)
        const donationAmount = ethers.utils.formatUnits(value, 18);

        // Add this donation to our running total
        const donationBn = ethers.utils.parseUnits(donationAmount, 18);
        const newTotalBn = lastCumulative.add(donationBn);
        const newTotalStr = ethers.utils.formatUnits(newTotalBn, 18);

        const timestamp = new Date().toISOString();

        // Create a new donation record with the cumulative total
        const newDonation = {
          timestamp,
          from,
          amount: donationAmount,
          acummulatedAmount: newTotalStr, // <-- The new field
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber
        };

        donations.push(newDonation);

        // Update our running total
        lastCumulative = newTotalBn;

        // Log to console
        console.log(`🎉 New Donation Received!`);
        console.log(`Block #${event.blockNumber}`);
        console.log(`From: ${from}`);
        console.log(`To:   ${to}`);
        console.log(`Amount: ${donationAmount}`);
        console.log(`Acummulated Amount: ${newTotalStr}`);
        console.log(`Tx Hash: ${event.transactionHash}`);
        console.log(`Timestamp: ${timestamp}`);
        console.log('----------------------------------');
      }

      // Persist updated donations
      saveDonations(donations);
    }

    // Move our pointer to the next block to avoid re-scanning the same range
    lastScannedBlock = currentBlock + 1;
  } catch (error) {
    console.error('Error scanning new transfers:', error);
  }
}

// ========== CHECK SUPPLY AND BALANCE (BURN / DONATION DETECTOR) ==========

async function checkSupplyAndBalance() {
  try {
    // Get the current total supply
    const currentSupply = await tokenContract.totalSupply();
    const currentSupplyFormatted = ethers.utils.formatUnits(currentSupply, 18);

    // Get the current balance of the donation wallet
    const donationBalance = await tokenContract.balanceOf(donationWallet);
    const donationBalanceFormatted = ethers.utils.formatUnits(donationBalance, 18);

    // Detect supply change (burn event)
    if (lastSupply !== null && lastSupply !== currentSupplyFormatted) {
      const burnedAmount = lastSupply - currentSupplyFormatted;
      console.log(`🔥 Supply Change Detected!`);
      console.log(`Burned: ${burnedAmount.toFixed(6)} tokens`);
      console.log(`Remaining Supply: ${currentSupplyFormatted} tokens`);
      console.log(`🎁 Donation Wallet Balance: ${donationBalanceFormatted} tokens`);
      console.log('----------------------------------');
    }

    // Detect donation event (balance-based approach)
    if (
      lastDonationBalance !== null &&
      Number(donationBalanceFormatted) > Number(lastDonationBalance)
    ) {
      const donationReceived = donationBalanceFormatted - lastDonationBalance;
      console.log(`🎉 A Donation Was Made (balance-based check)!`);
      console.log(`💰 Donation Amount: ${donationReceived.toFixed(6)} tokens`);
      console.log(`📈 New Donation Wallet Balance: ${donationBalanceFormatted} tokens`);
      console.log('----------------------------------');
    }

    // Update last recorded values
    lastSupply = currentSupplyFormatted;
    lastDonationBalance = donationBalanceFormatted;
  } catch (error) {
    console.error('Error fetching supply/balance:', error);
  }
}

// ========== MAIN LOOP (EVERY 10 SECONDS) ==========

async function mainLoop() {
  // 1) Scan for new transfers
  await scanNewTransfers();

  // 2) Check supply & balance
  await checkSupplyAndBalance();
}

// Kick off an immediate run, then repeat
mainLoop();
setInterval(mainLoop, 10_000);

console.log(`Starting from block #${lastScannedBlock}...`);
console.log('Scanning for donations & checking supply every 10 seconds...');
