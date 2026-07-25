const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  MAINNET_CONFIRMATION,
  OPEN_BOOK_PROFILE,
  SEVENTY_TWO_HOURS,
  amountFromBps,
  controlWindowForChain,
  normalizePrivateKey,
} = require("../scripts/lib/open-book-profile");

describe("Open Book launch profile", () => {
  it("puts the entire fixed supply into liquidity", () => {
    const supply = ethers.parseUnits("1000000000", 18);
    expect(amountFromBps(supply, OPEN_BOOK_PROFILE.tokenLiquidityBps)).to.equal(
      supply
    );
  });

  it("sets the temporary wallet cap to exactly 1% of supply", () => {
    const supply = ethers.parseUnits("1000000000", 18);
    expect(amountFromBps(supply, OPEN_BOOK_PROFILE.maxWalletBps)).to.equal(
      ethers.parseUnits("10000000", 18)
    );
  });

  it("uses the published 72-hour window on mainnet and mainnet forks", () => {
    expect(controlWindowForChain(56)).to.equal(SEVENTY_TWO_HOURS);
    expect(controlWindowForChain(31337, true)).to.equal(SEVENTY_TWO_HOURS);
  });

  it("requires an explicit irreversible-mainnet confirmation phrase", () => {
    expect(MAINNET_CONFIRMATION).to.equal("DEPLOY_10_BNB_AND_BURN_LP");
  });

  it("normalizes private keys with or without a 0x prefix", () => {
    const raw = "11".repeat(32);
    expect(normalizePrivateKey(raw)).to.equal(`0x${raw}`);
    expect(normalizePrivateKey(`0x${raw}`)).to.equal(`0x${raw}`);
    expect(normalizePrivateKey("not-a-key")).to.equal(undefined);
  });

  it("rejects invalid basis-point inputs", () => {
    expect(() => amountFromBps(1_000n, 10_001n)).to.throw(
      "Basis points out of range"
    );
  });
});
