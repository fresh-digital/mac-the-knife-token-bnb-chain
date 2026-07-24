const hre = require("hardhat");
const { ethers } = hre;

// "Am I ready to deploy?" — checks your .env WITHOUT ever printing your private key.
// Run:  npm run preflight:testnet
async function main() {
  const network = hre.network.name;
  console.log(`\nPre-flight — network: ${network}\n`);

  const key = process.env.PRIVATE_KEY;
  if (!key) {
    console.log("[x] PRIVATE_KEY is not set.");
    console.log("    Copy .env.example to .env and paste your burner wallet's private key.");
    process.exitCode = 1;
    return;
  }

  const normalized = key.startsWith("0x") ? key : "0x" + key;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    console.log("[x] PRIVATE_KEY doesn't look like a 64-character hex key. Re-check it.");
    process.exitCode = 1;
    return;
  }

  let wallet;
  try {
    wallet = new ethers.Wallet(normalized); // derives address locally, no network needed
  } catch (e) {
    console.log("[x] Invalid private key:", e.message);
    process.exitCode = 1;
    return;
  }

  console.log(`[ok] Key loaded. Deployer address:  ${wallet.address}`);
  console.log(`     -> Fund THIS address with test BNB from the faucet.\n`);

  if (network === "hardhat" || network === "localhost") {
    console.log("Run against testnet to also check your balance:  npm run preflight:testnet");
    return;
  }

  try {
    const bal = await ethers.provider.getBalance(wallet.address);
    console.log(`Balance on ${network}:  ${ethers.formatEther(bal)} BNB`);
    if (bal === 0n) {
      console.log("[x] Zero balance — get test BNB from the faucet before deploying.");
      process.exitCode = 1;
    } else {
      console.log("[ok] Funded. You're ready:  npm run deploy:testnet");
    }
  } catch (e) {
    console.log(`[!] Couldn't reach the ${network} RPC to check balance: ${e.message}`);
    console.log("    You can still try deploying; it may just be a busy public node.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
