require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("solidity-coverage");
require("dotenv").config();

const {
  PRIVATE_KEY,
  BSCSCAN_API_KEY,
  BSC_RPC_URL,
  BSC_TESTNET_RPC_URL,
  BSC_FORK_RPC_URL,
  BSC_RPC_URL_BACKUP,
  BSC_TESTNET_RPC_URL_BACKUP,
} = process.env;

// Only attach a signer when the key is structurally valid, so `npm test` works with no
// .env and `scripts/preflight.js` can print a useful error for malformed keys instead of
// Hardhat rejecting the network config before the script starts. The documented
// with-or-without-0x input is normalized here, not merely in the preflight.
const rawPrivateKey = PRIVATE_KEY?.trim();
const normalizedPrivateKey = rawPrivateKey
  ? rawPrivateKey.startsWith("0x")
    ? rawPrivateKey
    : `0x${rawPrivateKey}`
  : undefined;
const accounts =
  normalizedPrivateKey && /^0x[0-9a-fA-F]{64}$/.test(normalizedPrivateKey)
    ? [normalizedPrivateKey]
    : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      // Runtime-gas profile: optimize as if this code runs forever, trading deploy-time
      // bytecode size for cheaper transfers. Measured on this contract vs runs:200 —
      // -174 gas/transfer, +249k deploy gas, +1188 bytecode bytes. solc output is
      // byte-identical at runs >= 10000; 999999 is the conventional saturated value.
      optimizer: { enabled: true, runs: 999999 },
      // "paris" avoids the PUSH0 opcode — safest across all BSC nodes.
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      forking: {
        // Fork rehearsals perform many historical-state reads. Use an independent
        // fork endpoint instead of assuming the deployment RPC retains trie history.
        url:
          BSC_FORK_RPC_URL ||
          BSC_RPC_URL ||
          "https://bsc-rpc.publicnode.com",
        enabled: process.env.FORK === "true",
        // Non-archive public nodes prune old state; set FORK_BLOCK to a near-tip
        // block to avoid "missing trie node" errors during a fork rehearsal.
        ...(process.env.FORK_BLOCK ? { blockNumber: parseInt(process.env.FORK_BLOCK, 10) } : {}),
      },
    },
    bscTestnet: {
      url: BSC_TESTNET_RPC_URL || "https://bsc-testnet-rpc.publicnode.com",
      chainId: 97,
      accounts,
    },
    bsc: {
      url: BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org",
      chainId: 56,
      accounts,
    },
    // Same chains, different RPC operators. If a public node rate-limits or stalls
    // mid-launch, re-run the same command with --network bscBackup / bscTestnetBackup.
    // This is RPC resilience only — it has NOTHING to do with BscScan API rate limits,
    // which are a separate service (see the etherscan note below).
    bscTestnetBackup: {
      url:
        BSC_TESTNET_RPC_URL_BACKUP ||
        "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      accounts,
    },
    bscBackup: {
      url: BSC_RPC_URL_BACKUP || "https://bsc-rpc.publicnode.com",
      chainId: 56,
      accounts,
    },
  },
  // Source verification. A SINGLE string key activates the Etherscan v2 API
  // (api.etherscan.io/v2 + chainid). The per-network object form silently pins the v1
  // BscScan endpoint, whose end-of-life hardhat-verify itself dates to 2025-05-31 — so use
  // a unified key from https://etherscan.io/myapikey, NOT a bscscan.com-only key.
  // `customChains` is deliberately absent: in v2 mode the plugin discards per-chain apiURL
  // and resolves by chain id, so the *Backup networks above verify with no extra config.
  // Etherscan's BSC API is optional. Sourcify is the no-key, open-source baseline and
  // supports chain 56; when an Etherscan key is present `hardhat verify` submits to both.
  etherscan: {
    enabled: Boolean(BSCSCAN_API_KEY),
    apiKey: BSCSCAN_API_KEY || "",
  },
  sourcify: { enabled: true },
};
