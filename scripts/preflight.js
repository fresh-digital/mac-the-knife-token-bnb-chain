const hre = require("hardhat");
const { ethers } = hre;
const {
  MAINNET_CHAIN_ID,
  MAINNET_CONFIRMATION,
  OPEN_BOOK_PROFILE,
  TESTNET_CHAIN_ID,
  normalizePrivateKey,
} = require("./lib/open-book-profile");

const ROUTER_ABI = [
  "function WETH() view returns (address)",
  "function factory() view returns (address)",
];

function fail(message) {
  console.log(`[x] ${message}`);
  process.exitCode = 1;
}

async function main() {
  const networkName = hre.network.name;
  console.log(`\nPreflight — ${networkName}\n`);

  const rawKey = process.env.PRIVATE_KEY;
  if (!rawKey) {
    fail("PRIVATE_KEY is not set.");
    console.log("    Copy .env.example to .env and use a brand-new launch wallet.");
    return;
  }

  const normalizedKey = normalizePrivateKey(rawKey);
  if (!normalizedKey) {
    fail("PRIVATE_KEY must be exactly 32 bytes of hexadecimal, with or without 0x.");
    return;
  }

  let wallet;
  try {
    wallet = new ethers.Wallet(normalizedKey);
  } catch (error) {
    fail(`PRIVATE_KEY is not a valid secp256k1 key: ${error.message}`);
    return;
  }
  console.log(`[ok] Key structure valid. Deployer: ${wallet.address}`);

  let chainId;
  try {
    chainId = Number((await ethers.provider.getNetwork()).chainId);
  } catch (error) {
    fail(`RPC connection failed: ${error.message}`);
    return;
  }

  const expectedChainId = networkName.toLowerCase().includes("testnet")
    ? TESTNET_CHAIN_ID
    : MAINNET_CHAIN_ID;
  if (chainId !== expectedChainId) {
    fail(`RPC returned chain ${chainId}; ${networkName} must be chain ${expectedChainId}.`);
    return;
  }
  console.log(`[ok] RPC chain id: ${chainId}`);

  const latestBlock = await ethers.provider.getBlock("latest");
  const blockAge = Math.floor(Date.now() / 1_000) - latestBlock.timestamp;
  if (blockAge > 300 || blockAge < -30) {
    fail(`RPC latest block timestamp is unhealthy (${blockAge}s from local time).`);
    return;
  }
  console.log(`[ok] RPC latest block: ${latestBlock.number} (${blockAge}s old)`);

  const balance = await ethers.provider.getBalance(wallet.address);
  const feeData = await ethers.provider.getFeeData();
  console.log(`[ok] Wallet balance: ${ethers.formatEther(balance)} BNB`);
  if (feeData.gasPrice !== null) {
    console.log(`[ok] Current gas price: ${ethers.formatUnits(feeData.gasPrice, "gwei")} gwei`);
  }

  if (chainId === TESTNET_CHAIN_ID) {
    const minimumTestnetBalance = ethers.parseEther("0.02");
    if (balance < minimumTestnetBalance) {
      fail(
        `testnet rehearsal requires at least 0.02 tBNB; wallet has ${ethers.formatEther(
          balance
        )}`
      );
      return;
    }
    console.log("[ok] Testnet wallet is funded for deploy + verification rehearsal.");
    console.log("\nReady: npm run deploy:testnet");
    return;
  }

  const routerCode = await ethers.provider.getCode(OPEN_BOOK_PROFILE.router);
  if (routerCode === "0x") {
    fail(`no PancakeSwap Router V2 code at ${OPEN_BOOK_PROFILE.router}`);
    return;
  }
  const router = new ethers.Contract(
    OPEN_BOOK_PROFILE.router,
    ROUTER_ABI,
    ethers.provider
  );
  const [factory, wbnb] = await Promise.all([router.factory(), router.WETH()]);
  console.log(`[ok] PancakeSwap Router V2: ${OPEN_BOOK_PROFILE.router}`);
  console.log(`[ok] PancakeSwap Factory:   ${factory}`);
  console.log(`[ok] WBNB:                  ${wbnb}`);

  const requiredBalance =
    ethers.parseEther(OPEN_BOOK_PROFILE.liquidityBnb) +
    ethers.parseEther(OPEN_BOOK_PROFILE.gasBufferBnb);
  if (balance < requiredBalance) {
    fail(
      `Open Book profile requires at least ${ethers.formatEther(
        requiredBalance
      )} BNB (10 liquidity + 0.1 gas buffer); wallet has ${ethers.formatEther(
        balance
      )} BNB`
    );
    return;
  }
  console.log(
    `[ok] Balance covers 10 BNB liquidity and the 0.1 BNB transaction buffer.`
  );

  if (process.env.BSCSCAN_API_KEY) {
    console.log(
      "[ok] Optional Etherscan API key is present for the post-launch verify:mainnet command."
    );
  } else {
    console.log("[ok] No explorer API key required; launch verifies on Sourcify.");
  }

  if (process.env.CONFIRM_OPEN_BOOK_LAUNCH !== MAINNET_CONFIRMATION) {
    fail(
      `set CONFIRM_OPEN_BOOK_LAUNCH=${MAINNET_CONFIRMATION} only after reviewing the final profile`
    );
    return;
  }
  console.log("[ok] Irreversible launch confirmation matches the frozen profile.");

  console.log("\nPREFLIGHT PASSED");
  console.log("Ready for the human-signed command: npm run launch:mainnet");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
