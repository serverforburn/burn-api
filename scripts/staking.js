const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ========== CONFIGURATION ==========

const uniRpcUrl = 'https://mainnet.unichain.org/'; // RPC Endpoint
const STAKING_CONTRACT_ADDRESS = '0x580a3EA6A48FFe93dF535AA80393420bEcF4Fc62';
const STAKES_FILE = path.join(process.cwd(), 'staking.json'); // Staking history storage
const START_BLOCK = 8533484; // Block to start scanning from

// Staking Contract ABI with Deposit and Withdraw events
const stakingAbi = [
  'event Deposit(address indexed user, uint256 amount, uint256 lockTierIdx, uint256 nonce, uint256 burntAmount)',
  'event Withdraw(address indexed user, uint256 amount, uint256 penalty)'
];

// ========== SETUP ==========

const provider = new ethers.providers.JsonRpcProvider(uniRpcUrl);
const stakingContract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, stakingAbi, provider);

// ========== RESET STAKES FILE ==========

function resetStakesFile() {
  console.log("🧹 Resetting staking.json...");
  try {
    fs.writeFileSync(STAKES_FILE, JSON.stringify([], null, 2));
    console.log("✅ staking.json file has been cleared.");
  } catch (error) {
    console.error("❌ Error resetting staking.json:", error);
  }
}

// ========== FETCH PAST STAKING EVENTS ==========

async function fetchPastStakes() {
  console.log(`🔄 Fetching staking history from block ${START_BLOCK}...`);
  resetStakesFile(); // Clear JSON **before** fetching data

  try {
    let accumulatedStakes = ethers.BigNumber.from("0");
    const stakes = [];

    // Create filters for Deposit and Withdraw events
    const depositFilter = stakingContract.filters.Deposit();
    const withdrawFilter = stakingContract.filters.Withdraw();

    // Fetch events from the blockchain
    const depositEvents = await stakingContract.queryFilter(depositFilter, START_BLOCK, "latest");
    const withdrawEvents = await stakingContract.queryFilter(withdrawFilter, START_BLOCK, "latest");

    // Combine both event arrays and sort them by block number and log index to preserve order
    const allEvents = depositEvents.concat(withdrawEvents);
    allEvents.sort((a, b) => {
      if (a.blockNumber === b.blockNumber) {
        return a.logIndex - b.logIndex;
      }
      return a.blockNumber - b.blockNumber;
    });

    // Process each event in order
    for (const event of allEvents) {
      const { transactionHash, blockNumber, args, event: eventName, logIndex } = event;

      // Get the block timestamp
      const block = await provider.getBlock(blockNumber);
      const timestamp = new Date(block.timestamp * 1000).toISOString();

      let amount;
      let eventType;

      if (eventName === "Deposit") {
        eventType = "Deposit";
        // args: [ user, amount, lockTierIdx, nonce, burntAmount ]
        amount = args.amount;
        accumulatedStakes = accumulatedStakes.add(amount);
      } else if (eventName === "Withdraw") {
        eventType = "Withdraw";
        // args: [ user, amount, penalty ]
        amount = args.amount;
        accumulatedStakes = accumulatedStakes.sub(amount);
      }

      // Format values assuming 18 decimals (adjust if needed)
      const formattedAmount = ethers.utils.formatUnits(amount, 18);
      const formattedAccumulated = ethers.utils.formatUnits(accumulatedStakes, 18);

      const stakeEvent = {
        timestamp,
        eventType,
        amount: formattedAmount,
        accumulatedStakes: formattedAccumulated,
        transactionHash,
        blockNumber,
        logIndex
      };

      stakes.push(stakeEvent);
      console.log(
        `${eventType} Detected! Block: ${blockNumber}, Amount: ${formattedAmount}, Accumulated Stakes: ${formattedAccumulated}`
      );
    }

    // Save the staking event data to file
    fs.writeFileSync(STAKES_FILE, JSON.stringify(stakes, null, 2));
    console.log(`✅ Staking history successfully updated.`);
  } catch (error) {
    console.error('❌ Error fetching past staking events:', error);
  }
}

// ========== MAIN EXECUTION ==========

async function main() {
  resetStakesFile(); // Clear JSON file **before** processing
  await fetchPastStakes();
  console.log(`✅ Staking tracking completed. Exiting...`);
}

main();
