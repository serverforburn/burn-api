const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ========== CONFIGURATION ==========

const uniRpcUrl = 'https://mainnet.unichain.org/'; // RPC Endpoint
const tokenAddress = '0xa84A8Acc04CD47e18bF5Af826aB00D5026552EA5'; // Token Contract
const BURN_FILE = path.join(process.cwd(), 'burn.json'); // Burn history storage
const START_BLOCK = 8533484; // Block to start scanning from

// ERC-20 ABI
const erc20Abi = [
  'function totalSupply() external view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];

// ========== SETUP ==========

const provider = new ethers.providers.JsonRpcProvider(uniRpcUrl);
const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);

// ========== RESET BURN FILE ==========

function resetBurnFile() {
  console.log("🧹 Resetting burn.json...");
  try {
    fs.writeFileSync(BURN_FILE, JSON.stringify([], null, 2));
    console.log("✅ burn.json file has been cleared.");
  } catch (error) {
    console.error("❌ Error resetting burn.json:", error);
  }
}

// ========== FETCH PAST BURNS ==========

async function fetchPastBurns() {
  console.log(`🔄 Fetching burn history from block ${START_BLOCK}...`);
  resetBurnFile(); // Clear JSON **before** fetching data

  try {
    let lastCumulative = ethers.BigNumber.from("0");
    const burns = [];

    // Fetch Transfer events where `to` is the burn address (0x0000000000000000000000000000000000000000)
    const filter = tokenContract.filters.Transfer(null, '0x0000000000000000000000000000000000000000');
    const events = await tokenContract.queryFilter(filter, START_BLOCK, "latest");

    for (const event of events) {
      const { transactionHash, blockNumber, args } = event;
      const burnedBn = ethers.BigNumber.from(args.value);
      lastCumulative = lastCumulative.add(burnedBn);

      const newBurn = {
        timestamp: new Date().toISOString(),
        burnedAmount: ethers.utils.formatUnits(burnedBn, 18),
        accumulatedBurn: ethers.utils.formatUnits(lastCumulative, 18),
        transactionHash,
        blockNumber
      };

      burns.push(newBurn);
      console.log(`🔥 Burn Detected! Block: ${blockNumber}, Burned: ${ethers.utils.formatUnits(burnedBn, 18)} tokens`);
    }

    // Save the new burn data to file
    fs.writeFileSync(BURN_FILE, JSON.stringify(burns, null, 2));
    console.log(`✅ Burn history successfully updated.`);
  } catch (error) {
    console.error('❌ Error fetching past burns:', error);
  }
}

// ========== MAIN EXECUTION ==========

async function main() {
  resetBurnFile(); // Clear JSON file **before** processing
  await fetchPastBurns();
  console.log(`✅ Burn tracking completed. Exiting...`);
}

main();
