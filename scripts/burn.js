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
let lastSupply = null;

// ========== BURN FILE HELPERS ==========
function loadBurns() {
  try {
    const data = fs.readFileSync(BURN_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

function saveBurns(burns) {
  fs.writeFileSync(BURN_FILE, JSON.stringify(burns, null, 2));
}

// ========== FETCH PAST BURNS ==========
async function fetchPastBurns() {
  console.log(`🔄 Fetching burn history from block ${START_BLOCK}...`);

  try {
    const burns = loadBurns();
    let lastCumulative = ethers.BigNumber.from("0");

    if (burns.length > 0) {
      const lastEntry = burns[burns.length - 1];
      if (lastEntry.accumulatedBurn) {
        lastCumulative = ethers.utils.parseUnits(lastEntry.accumulatedBurn, 18);
      }
    }

    const filter = tokenContract.filters.Transfer(null, '0x0000000000000000000000000000000000000000');
    const events = await tokenContract.queryFilter(filter, START_BLOCK, "latest");

    for (const event of events) {
      const { transactionHash, blockNumber, args } = event;
      const burnedBn = ethers.BigNumber.from(args.value);
      const newTotalBurnBn = lastCumulative.add(burnedBn);
      const newTotalBurnStr = ethers.utils.formatUnits(newTotalBurnBn, 18);

      const timestamp = new Date().toISOString();

      const newBurn = {
        timestamp,
        burnedAmount: ethers.utils.formatUnits(burnedBn, 18),
        accumulatedBurn: newTotalBurnStr,
        transactionHash,
        blockNumber
      };

      burns.push(newBurn);
      lastCumulative = newTotalBurnBn;

      console.log(`🔥 Past Burn Detected!`);
      console.log(`Block: ${blockNumber}`);
      console.log(`Transaction: ${transactionHash}`);
      console.log(`Burned: ${ethers.utils.formatUnits(burnedBn, 18)} tokens`);
      console.log(`Cumulative Burned: ${newTotalBurnStr} tokens`);
      console.log('----------------------------------');
    }

    saveBurns(burns);
  } catch (error) {
    console.error('❌ Error fetching past burns:', error);
  }
}

// ========== CHECK TOTAL SUPPLY FOR NEW BURNS ==========
async function checkBurnedTokens() {
  try {
    const currentSupply = await tokenContract.totalSupply();
    const currentSupplyFormatted = ethers.utils.formatUnits(currentSupply, 18);

    const burns = loadBurns();
    let lastCumulative = ethers.BigNumber.from("0");

    if (burns.length > 0) {
      const lastEntry = burns[burns.length - 1];
      if (lastEntry.accumulatedBurn) {
        lastCumulative = ethers.utils.parseUnits(lastEntry.accumulatedBurn, 18);
      }
    }

    if (lastSupply !== null && ethers.BigNumber.from(lastSupply).gt(currentSupply)) {
      const burnedBn = ethers.BigNumber.from(lastSupply).sub(currentSupply);
      const newTotalBurnBn = lastCumulative.add(burnedBn);
      const newTotalBurnStr = ethers.utils.formatUnits(newTotalBurnBn, 18);

      const timestamp = new Date().toISOString();

      const newBurn = {
        timestamp,
        burnedAmount: ethers.utils.formatUnits(burnedBn, 18),
        accumulatedBurn: newTotalBurnStr,
        supplyAfterBurn: currentSupplyFormatted
      };

      burns.push(newBurn);
      saveBurns(burns);

      console.log(`🔥 Tokens Burned!`);
      console.log(`Burned: ${ethers.utils.formatUnits(burnedBn, 18)} tokens`);
      console.log(`Cumulative Burned: ${newTotalBurnStr} tokens`);
      console.log(`Remaining Supply: ${currentSupplyFormatted} tokens`);
      console.log('----------------------------------');
    }

    lastSupply = currentSupply;
  } catch (error) {
    console.error('Error fetching supply/burn data:', error);
  }
}

// ========== TRACK LIVE BURNS USING TRANSFER EVENT ==========
tokenContract.on("Transfer", async (from, to, value, event) => {
  if (to === '0x0000000000000000000000000000000000000000') {
    const burns = loadBurns();
    let lastCumulative = ethers.BigNumber.from("0");

    if (burns.length > 0) {
      const lastEntry = burns[burns.length - 1];
      if (lastEntry.accumulatedBurn) {
        lastCumulative = ethers.utils.parseUnits(lastEntry.accumulatedBurn, 18);
      }
    }

    const burnedBn = ethers.BigNumber.from(value);
    const newTotalBurnBn = lastCumulative.add(burnedBn);
    const newTotalBurnStr = ethers.utils.formatUnits(newTotalBurnBn, 18);

    const timestamp = new Date().toISOString();

    const newBurn = {
      timestamp,
      burnedAmount: ethers.utils.formatUnits(burnedBn, 18),
      accumulatedBurn: newTotalBurnStr,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber
    };

    burns.push(newBurn);
    saveBurns(burns);

    console.log(`🔥 Burn Detected via Transfer Event!`);
    console.log(`Transaction: ${event.transactionHash}`);
    console.log(`Block: ${event.blockNumber}`);
    console.log(`Burned: ${ethers.utils.formatUnits(burnedBn, 18)} tokens`);
    console.log(`Cumulative Burned: ${newTotalBurnStr} tokens`);
    console.log('----------------------------------');
  }
});

// ========== MAIN LOOP (FETCH HISTORY & TRACK BURNS) ==========
async function main() {
  await fetchPastBurns();
  await checkBurnedTokens();
}

main();
setInterval(checkBurnedTokens, 10_000);

console.log(`🔥 Tracking burned tokens...`);
console.log(`Fetching burn history from block ${START_BLOCK} & listening for Transfer events...`);
