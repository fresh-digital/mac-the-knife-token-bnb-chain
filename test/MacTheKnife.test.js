const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_HOUR = 60 * 60;
const SUPPLY = ethers.parseUnits("1000000000", 18); // 1,000,000,000 KNIFE

async function deploy(windowSeconds = ONE_HOUR) {
  const [owner, alice, bob, pair] = await ethers.getSigners();
  const Knife = await ethers.getContractFactory("MacTheKnife");
  const knife = await Knife.deploy(owner.address, windowSeconds);
  await knife.waitForDeployment();
  return { knife, owner, alice, bob, pair };
}

describe("MacTheKnife (KNIFE)", () => {
  describe("Deployment & fixed supply", () => {
    it("has the confirmed defaults", async () => {
      const { knife } = await deploy();
      expect(await knife.name()).to.equal("Mac the Knife");
      expect(await knife.symbol()).to.equal("KNIFE");
      expect(await knife.decimals()).to.equal(18n);
    });

    it("mints the entire fixed supply to the deployer, once", async () => {
      const { knife, owner } = await deploy();
      expect(await knife.totalSupply()).to.equal(SUPPLY);
      expect(await knife.balanceOf(owner.address)).to.equal(SUPPLY);
    });

    it("exposes NO mint function (supply can never grow)", async () => {
      const { knife } = await deploy();
      expect(knife.mint).to.equal(undefined);
      expect(knife.mintTo).to.equal(undefined);
    });

    it("exposes NO blacklist / freeze function", async () => {
      const { knife } = await deploy();
      expect(knife.blacklist).to.equal(undefined);
      expect(knife.setBlacklist).to.equal(undefined);
      expect(knife.freeze).to.equal(undefined);
      expect(knife.ban).to.equal(undefined);
    });

    it("rejects a control window longer than the hard cap", async () => {
      const [owner] = await ethers.getSigners();
      const Knife = await ethers.getContractFactory("MacTheKnife");
      await expect(
        Knife.deploy(owner.address, 8 * 24 * ONE_HOUR)
      ).to.be.revertedWithCustomError(Knife, "ControlWindowTooLong");
    });
  });

  describe("No transfer tax", () => {
    it("delivers 100% of every transfer", async () => {
      const { knife, owner, alice, bob } = await deploy();
      await knife.enableTrading();
      const amount = ethers.parseUnits("12345", 18);
      await knife.transfer(alice.address, amount);
      expect(await knife.balanceOf(alice.address)).to.equal(amount);

      await knife.connect(alice).transfer(bob.address, amount);
      expect(await knife.balanceOf(bob.address)).to.equal(amount);
      expect(await knife.balanceOf(alice.address)).to.equal(0n);
    });
  });

  describe("Trading gate (one-way)", () => {
    it("blocks non-exempt transfers before trading opens", async () => {
      const { knife, owner, alice, bob } = await deploy();
      // Owner is exempt, so funding a wallet works even before launch.
      await knife.transfer(alice.address, ethers.parseUnits("1000", 18));
      // But a non-exempt -> non-exempt transfer is blocked.
      await expect(
        knife.connect(alice).transfer(bob.address, ethers.parseUnits("1", 18))
      ).to.be.revertedWithCustomError(knife, "TradingNotEnabled");
    });

    it("lets everyone trade once opened", async () => {
      const { knife, alice, bob } = await deploy();
      await knife.transfer(alice.address, ethers.parseUnits("1000", 18));
      await knife.enableTrading();
      await expect(
        knife.connect(alice).transfer(bob.address, ethers.parseUnits("1", 18))
      ).to.not.be.reverted;
    });

    it("cannot be turned off, and cannot be opened twice", async () => {
      const { knife } = await deploy();
      await knife.enableTrading();
      expect(await knife.tradingEnabled()).to.equal(true);
      await expect(knife.enableTrading()).to.be.revertedWithCustomError(
        knife,
        "AlreadyEnabled"
      );
    });

    it("only the owner can open trading", async () => {
      const { knife, alice } = await deploy();
      await expect(
        knife.connect(alice).enableTrading()
      ).to.be.revertedWithCustomError(knife, "OwnableUnauthorizedAccount");
    });
  });

  describe("Anti-snipe max wallet (cannot trap holders)", () => {
    it("enforces the cap for non-exempt buyers", async () => {
      const { knife, alice } = await deploy();
      await knife.setMaxWalletBeforeLaunch(ethers.parseUnits("500", 18));
      await knife.enableTrading();
      await expect(
        knife.transfer(alice.address, ethers.parseUnits("501", 18))
      ).to.be.revertedWithCustomError(knife, "MaxWalletExceeded");
      await expect(knife.transfer(alice.address, ethers.parseUnits("500", 18))).to
        .not.be.reverted;
    });

    it("cannot be set after trading opens (no tightening the trap)", async () => {
      const { knife } = await deploy();
      await knife.enableTrading();
      await expect(
        knife.setMaxWalletBeforeLaunch(ethers.parseUnits("1", 18))
      ).to.be.revertedWithCustomError(knife, "TradingAlreadyOpen");
    });

    it("can always be removed (looser is allowed)", async () => {
      const { knife, alice } = await deploy();
      await knife.setMaxWalletBeforeLaunch(ethers.parseUnits("500", 18));
      await knife.enableTrading();
      await knife.removeLimits();
      expect(await knife.maxWallet()).to.equal(0n);
      await expect(knife.transfer(alice.address, ethers.parseUnits("999999", 18)))
        .to.not.be.reverted;
    });
  });

  describe("The Deadhand Cut (liveness guaranteed)", () => {
    it("frees ALL transfers after the deadline, even if trading was never opened", async () => {
      const { knife, owner, alice, bob } = await deploy(ONE_HOUR);
      // Fund a non-exempt wallet while owner is still exempt.
      await knife.transfer(alice.address, ethers.parseUnits("1000", 18));
      // Trading never opened -> alice can't move yet.
      await expect(
        knife.connect(alice).transfer(bob.address, 1n)
      ).to.be.revertedWithCustomError(knife, "TradingNotEnabled");

      // Time passes the Deadhand deadline...
      await time.increase(ONE_HOUR + 1);

      // ...and the token is now permanently free, with no owner action at all.
      await expect(
        knife.connect(alice).transfer(bob.address, ethers.parseUnits("1000", 18))
      ).to.not.be.reverted;
      expect(await knife.balanceOf(bob.address)).to.equal(
        ethers.parseUnits("1000", 18)
      );
    });

    it("kills every owner power after the deadline", async () => {
      const { knife } = await deploy(ONE_HOUR);
      await time.increase(ONE_HOUR + 1);
      await expect(knife.enableTrading()).to.be.revertedWithCustomError(
        knife,
        "ControlWindowClosed"
      );
      await expect(
        knife.setMaxWalletBeforeLaunch(1n)
      ).to.be.revertedWithCustomError(knife, "ControlWindowClosed");
      await expect(knife.removeLimits()).to.be.revertedWithCustomError(
        knife,
        "ControlWindowClosed"
      );
      await expect(
        knife.setLimitExempt(ethers.ZeroAddress, true)
      ).to.be.revertedWithCustomError(knife, "ControlWindowClosed");
    });

    it("ignores a stale max-wallet cap after the deadline", async () => {
      const { knife, alice } = await deploy(ONE_HOUR);
      await knife.setMaxWalletBeforeLaunch(ethers.parseUnits("500", 18));
      await knife.enableTrading();
      await time.increase(ONE_HOUR + 1);
      // Cap is still 500 on paper, but no longer enforced.
      await expect(
        knife.transfer(alice.address, ethers.parseUnits("10000", 18))
      ).to.not.be.reverted;
    });
  });

  describe("status() — open book in one call", () => {
    it("reports the live safety picture", async () => {
      const { knife, owner } = await deploy(ONE_HOUR);
      let s = await knife.status();
      expect(s.trading).to.equal(false);
      expect(s.ownershipRenounced).to.equal(false);
      expect(s.controlWindowOpen_).to.equal(true);
      expect(s.supply).to.equal(SUPPLY);

      await knife.enableTrading();
      await knife.renounceOwnership();
      s = await knife.status();
      expect(s.trading).to.equal(true);
      expect(s.ownershipRenounced).to.equal(true);
    });
  });

  describe("Renounce & burn", () => {
    it("lets the owner cut strings early via renounceOwnership", async () => {
      const { knife, alice } = await deploy();
      await knife.enableTrading();
      await knife.renounceOwnership();
      expect(await knife.owner()).to.equal(ethers.ZeroAddress);
      await expect(
        knife.setLimitExempt(alice.address, true)
      ).to.be.revertedWithCustomError(knife, "OwnableUnauthorizedAccount");
    });

    it("lets holders burn, reducing total supply", async () => {
      const { knife, owner } = await deploy();
      const burn = ethers.parseUnits("1000000", 18);
      await knife.burn(burn);
      expect(await knife.totalSupply()).to.equal(SUPPLY - burn);
    });
  });
});
