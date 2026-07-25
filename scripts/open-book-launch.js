const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
const { executeOpenBookLaunch } = require("./lib/open-book-launch");

function writeJson(filePath, value, options = {}) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, options);
}

function findCompletedMainnetRecords(recordDirectory) {
  if (!fs.existsSync(recordDirectory)) return [];
  return fs
    .readdirSync(recordDirectory)
    .filter((name) => /^56-0x[0-9a-f]{40}\.json$/i.test(name));
}

async function main() {
  const recordDirectory = path.join(__dirname, "..", "launch-records");
  fs.mkdirSync(recordDirectory, { recursive: true });
  const pendingPath = path.join(recordDirectory, "pending-mainnet.json");
  const completedRecords = findCompletedMainnetRecords(recordDirectory);
  if (completedRecords.length > 0) {
    throw new Error(
      `A completed mainnet launch record already exists (${completedRecords.join(
        ", "
      )}). Refusing to deploy a second KNIFE token.`
    );
  }
  if (fs.existsSync(pendingPath)) {
    throw new Error(
      "An interrupted mainnet launch journal exists at launch-records/pending-mainnet.json. " +
        "Do not rerun the launch. Run npm run inspect:launch:mainnet first."
    );
  }

  const journal = {
    schemaVersion: 1,
    state: "started",
    network: hre.network.name,
    startedAt: new Date().toISOString(),
    events: [],
  };
  writeJson(pendingPath, journal, { flag: "wx" });

  let transactionBroadcast = false;
  let record;
  try {
    record = await executeOpenBookLaunch(hre, {
      onCheckpoint(checkpoint) {
        journal.events.push(checkpoint);
        if (checkpoint.event === "transaction-broadcast") {
          transactionBroadcast = true;
        }
        journal.state = checkpoint.event;
        writeJson(pendingPath, journal);
      },
    });
  } catch (error) {
    journal.state = transactionBroadcast ? "interrupted-after-broadcast" : "failed-before-broadcast";
    journal.error = error.message;
    journal.failedAt = new Date().toISOString();
    writeJson(pendingPath, journal);
    if (!transactionBroadcast) {
      fs.rmSync(pendingPath);
    }
    throw error;
  }

  const recordPath = path.join(
    recordDirectory,
    `${record.rpcChainId}-${record.token.toLowerCase()}.json`
  );
  writeJson(recordPath, record, { flag: "wx" });
  const siteConfigPath = path.join(__dirname, "..", "site", "launch-config.js");
  const publicConfig = {
    chainId: record.rpcChainId,
    contractAddress: record.token,
    pairAddress: record.pair,
    controlDeadlineUnix: record.controlDeadlineUnix,
    ownershipRenounced: record.ownershipRenounced,
    lpBurnAddress: record.lpBurnAddress,
    sourceUrl: record.publicLinks.source,
    explorerUrl: record.publicLinks.explorer,
    swapUrl: record.publicLinks.swap,
  };
  fs.writeFileSync(
    siteConfigPath,
    `// Generated from the verified mainnet launch record.\n` +
      `window.KNIFE_LAUNCH = Object.freeze(${JSON.stringify(
        publicConfig,
        null,
        2
      )});\n`
  );
  journal.state = "completed";
  journal.completedAt = new Date().toISOString();
  journal.record = path.basename(recordPath);
  writeJson(pendingPath, journal);
  const journalPath = path.join(
    recordDirectory,
    `${record.rpcChainId}-${record.token.toLowerCase()}.journal.json`
  );
  fs.renameSync(pendingPath, journalPath);

  console.log("\nOPEN BOOK LAUNCH COMPLETE");
  console.log(`Token:          ${record.token}`);
  console.log(`Pair:           ${record.pair}`);
  console.log(`LP burned:      ${record.lpTokensBurned}`);
  console.log(`Owner:          renounced`);
  console.log(`Launch record:  ${recordPath}`);
  console.log(`Launch journal: ${journalPath}`);
  console.log(`Site config:    ${siteConfigPath}`);
  console.log("\nPublish the launch record and complete the public-hygiene checklist.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
