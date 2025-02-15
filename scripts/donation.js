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
const START_BLOCK = 8533484;

// Where we'll store donation info
const DONATIONS_FILE = path.join(process.cwd(), 'donations.json');

// ERC-20 ABI
const erc20Abi = [
  'function totalSupply() external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];

// ========== SETUP ==========

const provider = new ethers.providers.JsonRpcProvider(uniRpcUrl);
const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);

// ========== RESET DONATION FILE ==========

function resetDonationsFile() {
  console.log("🧹 Resetting donations.json...");
  try {
    fs.writeFileSync(DONATIONS_FILE, JSON.stringify([], null, 2));
    console.log("✅ donations.json file has been cleared.");
  } catch (error) {
    console.error("❌ Error resetting donations.json:", error);
  }
}

// ========== FETCH PAST DONATIONS ==========

async function fetchDonations() {
  console.log(`🔄 Fetching donation history from block ${START_BLOCK}...`);
  resetDonationsFile(); // Clear JSON **before** fetching data

  try {
    let lastCumulative = ethers.BigNumber.from("0");
    const donations = [];

    // Fetch Transfer events where `to` is the donation wallet
    const filter = tokenContract.filters.Transfer(null, donationWallet);
    const events = await tokenContract.queryFilter(filter, START_BLOCK, "latest");

    for (const event of events) {
      const { transactionHash, blockNumber, args } = event;
      const from = args[0];
      const value = ethers.BigNumber.from(args[2]); // Amount transferred

      lastCumulative = lastCumulative.add(value);

      // Fetch the timestamp of the block containing the transaction
      const block = await provider.getBlock(blockNumber);
      const timestamp = new Date(block.timestamp * 1000).toISOString(); // Convert to readable format

      const newDonation = {
        timestamp, // Use block timestamp instead of new Date()
        from,
        amount: ethers.utils.formatUnits(value, 18),
        acummulatedAmount: ethers.utils.formatUnits(lastCumulative, 18),
        transactionHash,
        blockNumber
      };

      donations.push(newDonation);

      console.log(`🎉 Donation Detected! Block: ${blockNumber}, Amount: ${ethers.utils.formatUnits(value, 18)} tokens`);
    }

    // Save the new donation data to file
    fs.writeFileSync(DONATIONS_FILE, JSON.stringify(donations, null, 2));
    console.log(`✅ Donation history successfully updated.`);
  } catch (error) {
    console.error('❌ Error fetching donations:', error);
  }
}

// ========== MAIN EXECUTION ==========

async function main() {
  resetDonationsFile(); // Clear JSON file **before** processing
  await fetchDonations();
  console.log(`✅ Donation tracking completed. Exiting...`);
}

main();
