// Supplemental coverage for paths not exercised by MacTheKnife.test.js.
// Kept in a separate file so the original authored suite stays untouched.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_HOUR = 60 * 60;

async function deploy(windowSeconds = ONE_HOUR) {
  const [owner, alice, pair] = await ethers.getSigners();
  const Knife = await ethers.getContractFactory("MacTheKnife");
  const knife = await Knife.deploy(owner.address, windowSeconds);
  await knife.waitForDeployment();
  return { knife, owner, alice, pair };
}

describe("MacTheKnife — supplemental coverage", () => {
  describe("setLimitExempt", () => {
    it("owner can exempt and un-exempt an address, emitting the event", async () => {
      const { knife, pair } = await deploy();
      await expect(knife.setLimitExempt(pair.address, true))
        .to.emit(knife, "LimitExemptSet")
        .withArgs(pair.address, true);
      expect(await knife.isExemptFromLimits(pair.address)).to.equal(true);

      await expect(knife.setLimitExempt(pair.address, false))
        .to.emit(knife, "LimitExemptSet")
        .withArgs(pair.address, false);
      expect(await knife.isExemptFromLimits(pair.address)).to.equal(false);
    });

    it("reverts for a non-owner", async () => {
      const { knife, alice, pair } = await deploy();
      await expect(
        knife.connect(alice).setLimitExempt(pair.address, true)
      ).to.be.revertedWithCustomError(knife, "OwnableUnauthorizedAccount");
    });

    it("reverts after the control window closes", async () => {
      const { knife, pair } = await deploy();
      await time.increase(ONE_HOUR + 1);
      await expect(
        knife.setLimitExempt(pair.address, true)
      ).to.be.revertedWithCustomError(knife, "ControlWindowClosed");
    });
  });

  describe("controlWindowOpen()", () => {
    it("is true before the deadline and false after", async () => {
      const { knife } = await deploy();
      expect(await knife.controlWindowOpen()).to.equal(true);
      await time.increase(ONE_HOUR + 1);
      expect(await knife.controlWindowOpen()).to.equal(false);
    });
  });
});
