require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY, BSCSCAN_API_KEY, BSC_RPC_URL, BSC_TESTNET_RPC_URL } = process.env;

// Only attach a signer if a key is present, so `npm test` works with no .env at all.
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // "paris" avoids the PUSH0 opcode — safest across all BSC nodes.
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org",
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
  },
  // BscScan verification. Get a key at https://bscscan.com/myapikey (or the unified
  // Etherscan v2 key). See DEPLOYMENT.md if `hardhat verify` reports an API mismatch.
  etherscan: {
    apiKey: {
      bsc: BSCSCAN_API_KEY || "",
      bscTestnet: BSCSCAN_API_KEY || "",
    },
  },
  sourcify: { enabled: false },
};
