/**
 * Read-only recovery view for an interrupted Open Book mainnet launch.
 *
 * This script never signs or sends a transaction. It resolves every broadcast hash
 * recorded in launch-records/pending-mainnet.json and, when possible, reads the
 * deployed token's current status.
 */
const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

const TOKEN_ABI = [
  "function owner() view returns (address)",
  "function status() view returns (bool trading,uint256 maxWallet_,uint256 controlDeadline_,bool controlWindowOpen_,bool ownershipRenounced,uint256 supply)",
];

async function main() {
  const pendingPath = path.join(
    __dirname,
    "..",
    "launch-records",
    "pending-mainnet.json"
  );
  if (!fs.existsSync(pendingPath)) {
    console.log("No interrupted mainnet launch journal exists.");
    return;
  }

  const journal = JSON.parse(fs.readFileSync(pendingPath, "utf8"));
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  if (chainId !== 56) {
    throw new Error(`Read-only inspection requires BSC mainnet chain 56; RPC returned ${chainId}.`);
  }

  console.log("\nOPEN BOOK LAUNCH INSPECTION — READ ONLY\n");
  console.log(`Journal state: ${journal.state}`);
  console.log(`Started:       ${journal.startedAt}`);
  if (journal.error) console.log(`Recorded error: ${journal.error}`);

  const broadcasts = journal.events.filter(
    (event) => event.event === "transaction-broadcast"
  );
  const seen = new Set();
  for (const broadcast of broadcasts) {
    if (seen.has(broadcast.hash)) continue;
    seen.add(broadcast.hash);
    const receipt = await hre.ethers.provider.getTransactionReceipt(broadcast.hash);
    const state = receipt
      ? receipt.status === 1
        ? `CONFIRMED in block ${receipt.blockNumber}`
        : `FAILED in block ${receipt.blockNumber}`
      : "NOT YET CONFIRMED";
    console.log(`${broadcast.transaction.padEnd(20)} ${state}`);
    console.log(`  ${broadcast.hash}`);
  }

  const tokenEvent = [...journal.events]
    .reverse()
    .find((event) => event.token);
  if (tokenEvent) {
    const code = await hre.ethers.provider.getCode(tokenEvent.token);
    console.log(`\nToken candidate: ${tokenEvent.token}`);
    if (code === "0x") {
      console.log("Token bytecode:   not present at the latest block");
    } else {
      const token = new hre.ethers.Contract(
        tokenEvent.token,
        TOKEN_ABI,
        hre.ethers.provider
      );
      const [owner, status] = await Promise.all([token.owner(), token.status()]);
      console.log(`Owner:           ${owner}`);
      console.log(`Trading:         ${status.trading}`);
      console.log(`Max wallet:      ${status.maxWallet_}`);
      console.log(`Control deadline:${status.controlDeadline_}`);
      console.log(`Control open:    ${status.controlWindowOpen_}`);
      console.log(
        `Owner controls:  ${
          status.controlWindowOpen_ && owner !== hre.ethers.ZeroAddress
        }`
      );
      console.log(`Renounced:       ${status.ownershipRenounced}`);
      console.log(`Current supply:  ${status.supply}`);
    }
  }

  console.log(
    "\nDo not delete the journal or rerun launch:mainnet. Use these receipts and " +
      "on-chain values to choose a narrow recovery step."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
