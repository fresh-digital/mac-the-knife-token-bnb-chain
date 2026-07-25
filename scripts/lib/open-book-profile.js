const MAINNET_CHAIN_ID = 56;
const TESTNET_CHAIN_ID = 97;
const HARDHAT_CHAIN_ID = 31337;

const PANCAKE_V2_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const BPS_DENOMINATOR = 10_000n;
const SEVENTY_TWO_HOURS = 72 * 60 * 60;
const ONE_HOUR = 60 * 60;

const OPEN_BOOK_PROFILE = Object.freeze({
  name: "Open Book Community Launch",
  liquidityBnb: "10.0",
  gasBufferBnb: "0.1",
  tokenLiquidityBps: 10_000n, // 100% of the fixed supply
  maxWalletBps: 100n, // 1% during the control window
  controlWindowSeconds: SEVENTY_TWO_HOURS,
  burnLp: true,
  renounceOwnership: true,
  router: PANCAKE_V2_ROUTER,
  lpRecipient: DEAD_ADDRESS,
});

const MAINNET_CONFIRMATION = "DEPLOY_10_BNB_AND_BURN_LP";

function normalizePrivateKey(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(normalized) ? normalized : undefined;
}

function controlWindowForChain(chainId, fork = false) {
  if (chainId === MAINNET_CHAIN_ID || fork) {
    return SEVENTY_TWO_HOURS;
  }
  if (chainId === TESTNET_CHAIN_ID || chainId === HARDHAT_CHAIN_ID) {
    return ONE_HOUR;
  }
  throw new Error(`Unsupported chain id ${chainId}`);
}

function amountFromBps(amount, bps) {
  if (bps < 0n || bps > BPS_DENOMINATOR) {
    throw new Error(`Basis points out of range: ${bps}`);
  }
  return (amount * bps) / BPS_DENOMINATOR;
}

function isMainnetFork(chainId, fork) {
  return chainId === HARDHAT_CHAIN_ID && fork;
}

module.exports = {
  BPS_DENOMINATOR,
  DEAD_ADDRESS,
  HARDHAT_CHAIN_ID,
  MAINNET_CHAIN_ID,
  MAINNET_CONFIRMATION,
  ONE_HOUR,
  OPEN_BOOK_PROFILE,
  PANCAKE_V2_ROUTER,
  SEVENTY_TWO_HOURS,
  TESTNET_CHAIN_ID,
  ZERO_ADDRESS,
  amountFromBps,
  controlWindowForChain,
  isMainnetFork,
  normalizePrivateKey,
};
