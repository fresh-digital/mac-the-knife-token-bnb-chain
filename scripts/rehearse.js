const { spawnSync } = require("node:child_process");

async function getPinnedBlock(rpcUrl) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_blockNumber",
      params: [],
      id: 1,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Fork RPC returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload.error || typeof payload.result !== "string") {
    throw new Error(`Fork RPC block query failed: ${JSON.stringify(payload.error)}`);
  }
  return Number(BigInt(payload.result) - 2n);
}

async function main() {
  const rpcUrl =
    process.env.BSC_FORK_RPC_URL ||
    process.env.BSC_RPC_URL ||
    "https://bsc-rpc.publicnode.com";
  const forkBlock =
    process.env.FORK_BLOCK || String(await getPinnedBlock(rpcUrl));

  console.log(`Fork RPC:   ${rpcUrl}`);
  console.log(`Fork block: ${forkBlock}`);

  const hardhatCli = require.resolve("hardhat/internal/cli/bootstrap");
  const result = spawnSync(
    process.execPath,
    [hardhatCli, "run", "scripts/fork-rehearsal.js"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BSC_FORK_RPC_URL: rpcUrl,
        FORK: "true",
        FORK_BLOCK: forkBlock,
      },
      stdio: "inherit",
    }
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
