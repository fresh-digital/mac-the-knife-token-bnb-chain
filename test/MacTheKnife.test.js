const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_HOUR = 60 * 60;
const SEVENTY_TWO_HOURS = 72 * ONE_HOUR; // == MAX_CONTROL_WINDOW, == the published figure
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

    it("hard-caps the control window at exactly 72h — the figure the litepaper publishes", async () => {
      const { knife } = await deploy();
      expect(await knife.MAX_CONTROL_WINDOW()).to.equal(BigInt(SEVENTY_TWO_HOURS));
    });

    it("rejects a control window one second over the cap", async () => {
      const [owner] = await ethers.getSigners();
      const Knife = await ethers.getContractFactory("MacTheKnife");
      await expect(
        Knife.deploy(owner.address, SEVENTY_TWO_HOURS + 1)
      ).to.be.revertedWithCustomError(Knife, "ControlWindowTooLong");
    });

    it("announces the Deadhand deadline in a constructor log", async () => {
      const [owner] = await ethers.getSigners();
      const Knife = await ethers.getContractFactory("MacTheKnife");
      const knife = await Knife.deploy(owner.address, ONE_HOUR);
      await knife.waitForDeployment();

      // Read it out of the deployment transaction itself — the whole point is that an
      // indexer can learn the deadline from a log at genesis, with no view call.
      const receipt = await knife.deploymentTransaction().wait();
      const armed = receipt.logs
        .map((l) => {
          try {
            return knife.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .find((e) => e.name === "DeadhandArmed");

      expect(armed, "DeadhandArmed missing from the deployment tx").to.not.equal(
        undefined
      );
      expect(armed.args[0]).to.equal(await knife.controlDeadline());
      expect(armed.args[1]).to.equal(BigInt(ONE_HOUR));
    });

    it("accepts a window of exactly 72h (what deploy.js uses on mainnet)", async () => {
      const [owner] = await ethers.getSigners();
      const Knife = await ethers.getContractFactory("MacTheKnife");
      const knife = await Knife.deploy(owner.address, SEVENTY_TWO_HOURS);
      await knife.waitForDeployment();

      const deployedAt = (await ethers.provider.getBlock("latest")).timestamp;
      expect(await knife.controlDeadline()).to.equal(
        BigInt(deployedAt + SEVENTY_TWO_HOURS)
      );
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

    it("only the owner can set the cap", async () => {
      const { knife, alice } = await deploy();
      await expect(
        knife.connect(alice).setMaxWalletBeforeLaunch(ethers.parseUnits("1", 18))
      ).to.be.revertedWithCustomError(knife, "OwnableUnauthorizedAccount");
    });

    it("only the owner can remove limits", async () => {
      const { knife, alice } = await deploy();
      await knife.setMaxWalletBeforeLaunch(ethers.parseUnits("500", 18));
      await expect(
        knife.connect(alice).removeLimits()
      ).to.be.revertedWithCustomError(knife, "OwnableUnauthorizedAccount");
      // The cap is untouched by the failed attempt.
      expect(await knife.maxWallet()).to.equal(ethers.parseUnits("500", 18));
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

    it("kills every KNIFE-specific owner power after the deadline", async () => {
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

  // The contract flips two conditions on the very same instant:
  //   _update restricts        iff  block.timestamp <  controlDeadline
  //   duringControlWindow ok   iff  block.timestamp <  controlDeadline
  // So at t == controlDeadline the restrictions are already off AND KNIFE-specific powers are
  // already dead. These tests pin the exact second with setNextBlockTimestamp (not the
  // relative time.increase used above) to prove there is no gap — a second where the token
  // is locked with nobody able to unlock it — and no overlap — a second where the owner
  // still holds powers over an already-free token.
  //
  // One assertion per test with a fresh deploy: setNextBlockTimestamp must be strictly
  // greater than the last block's timestamp, so two txs cannot share one exact second.
  describe("The Deadhand Cut — exact boundary (no gap, no overlap)", () => {
    it("at deadline - 1s: transfers are still restricted", async () => {
      const { knife, alice, bob } = await deploy(ONE_HOUR);
      await knife.transfer(alice.address, ethers.parseUnits("1000", 18));
      const deadline = await knife.controlDeadline();

      await time.setNextBlockTimestamp(deadline - 1n);
      await expect(
        knife.connect(alice).transfer(bob.address, 1n)
      ).to.be.revertedWithCustomError(knife, "TradingNotEnabled");
    });

    it("at deadline - 1s: KNIFE-specific powers are still alive", async () => {
      const { knife } = await deploy(ONE_HOUR);
      const deadline = await knife.controlDeadline();

      await time.setNextBlockTimestamp(deadline - 1n);
      await expect(knife.enableTrading()).to.not.be.reverted;
      expect(await knife.tradingEnabled()).to.equal(true);
    });

    it("at deadline exactly: transfers are already free, with trading never opened", async () => {
      const { knife, alice, bob } = await deploy(ONE_HOUR);
      await knife.transfer(alice.address, ethers.parseUnits("1000", 18));
      const deadline = await knife.controlDeadline();
      expect(await knife.tradingEnabled()).to.equal(false);

      await time.setNextBlockTimestamp(deadline);
      await expect(
        knife.connect(alice).transfer(bob.address, ethers.parseUnits("1000", 18))
      ).to.not.be.reverted;
      expect(await knife.balanceOf(bob.address)).to.equal(
        ethers.parseUnits("1000", 18)
      );
    });

    it("at deadline exactly: KNIFE-specific powers are already dead", async () => {
      const { knife } = await deploy(ONE_HOUR);
      const deadline = await knife.controlDeadline();

      await time.setNextBlockTimestamp(deadline);
      await expect(knife.enableTrading()).to.be.revertedWithCustomError(
        knife,
        "ControlWindowClosed"
      );
    });

    it("at deadline + 1s: transfers pass unconditionally", async () => {
      const { knife, alice, bob } = await deploy(ONE_HOUR);
      await knife.transfer(alice.address, SUPPLY / 2n);
      const deadline = await knife.controlDeadline();

      await time.setNextBlockTimestamp(deadline + 1n);
      await expect(knife.connect(alice).transfer(bob.address, SUPPLY / 2n)).to.not
        .be.reverted;
      expect(await knife.balanceOf(bob.address)).to.equal(SUPPLY / 2n);
    });

    it("controlWindowRemaining() counts down and floors at 0", async () => {
      const { knife } = await deploy(ONE_HOUR);
      const deadline = await knife.controlDeadline();
      const now = BigInt((await ethers.provider.getBlock("latest")).timestamp);
      expect(await knife.controlWindowRemaining()).to.equal(deadline - now);

      await time.setNextBlockTimestamp(deadline - 60n);
      await mine();
      expect(await knife.controlWindowRemaining()).to.equal(60n);

      // Floors at 0 on the deadline itself, and stays there.
      await time.setNextBlockTimestamp(deadline);
      await mine();
      expect(await knife.controlWindowRemaining()).to.equal(0n);

      await time.increase(ONE_HOUR);
      expect(await knife.controlWindowRemaining()).to.equal(0n);
    });

    it("controlWindowOpen() flips on the same instant", async () => {
      const { knife } = await deploy(ONE_HOUR);
      const deadline = await knife.controlDeadline();
      expect(await knife.controlWindowOpen()).to.equal(true);

      await time.setNextBlockTimestamp(deadline);
      await mine(); // land a block on exactly `deadline`
      expect(await knife.controlWindowOpen()).to.equal(false);
    });
  });

  // Extreme-amount coverage for the anti-snipe cap. This is seeded parameterized property
  // testing, deterministic so CI cannot flake — NOT fuzzing. Hardhat/JS has no fuzzer;
  // real fuzzing would be Foundry's `forge test --fuzz-runs`.
  describe("maxWallet under extreme amounts (sniper-bot scenarios)", () => {
    const CAP = ethers.parseUnits("1000000", 18); // 0.1% of supply — a realistic cap

    it("passes at exactly the cap and reverts one wei over", async () => {
      const { knife, alice, bob } = await deploy();
      await knife.setMaxWalletBeforeLaunch(CAP);
      await knife.enableTrading();

      await expect(knife.transfer(alice.address, CAP)).to.not.be.reverted;
      expect(await knife.balanceOf(alice.address)).to.equal(CAP);

      await expect(
        knife.transfer(bob.address, CAP + 1n)
      ).to.be.revertedWithCustomError(knife, "MaxWalletExceeded");
    });

    it("counts accumulated balance, so a sniper cannot split the buy", async () => {
      const { knife, alice } = await deploy();
      await knife.setMaxWalletBeforeLaunch(CAP);
      await knife.enableTrading();

      const quarter = CAP / 4n;
      for (let i = 0; i < 4; i++) {
        await expect(knife.transfer(alice.address, quarter)).to.not.be.reverted;
      }
      expect(await knife.balanceOf(alice.address)).to.equal(CAP);

      await expect(
        knife.transfer(alice.address, 1n)
      ).to.be.revertedWithCustomError(knife, "MaxWalletExceeded");
    });

    it("still caps a sniper buying FROM the exempt LP pair", async () => {
      const { knife, pair, alice } = await deploy();
      const pool = ethers.parseUnits("100000000", 18);
      await knife.setMaxWalletBeforeLaunch(CAP);
      await knife.setLimitExempt(pair.address, true);
      await knife.enableTrading();

      // The pair is exempt, so the pool itself can hold any amount.
      await knife.transfer(pair.address, pool);
      expect(await knife.balanceOf(pair.address)).to.equal(pool);

      // The cap keys on `to`, never on `from` — exempting the pair opens no hole.
      await expect(
        knife.connect(pair).transfer(alice.address, CAP + 1n)
      ).to.be.revertedWithCustomError(knife, "MaxWalletExceeded");
      await expect(knife.connect(pair).transfer(alice.address, CAP)).to.not.be
        .reverted;
    });

    it("caps the transferFrom route identically (approval is not a bypass)", async () => {
      const { knife, owner, alice, bob } = await deploy();
      await knife.setMaxWalletBeforeLaunch(CAP);
      await knife.enableTrading();
      await knife.approve(alice.address, SUPPLY);

      await expect(
        knife.connect(alice).transferFrom(owner.address, bob.address, CAP + 1n)
      ).to.be.revertedWithCustomError(knife, "MaxWalletExceeded");
      await expect(
        knife.connect(alice).transferFrom(owner.address, bob.address, CAP)
      ).to.not.be.reverted;
    });

    it("treats a never-set cap as unlimited", async () => {
      const { knife, alice } = await deploy();
      await knife.enableTrading();
      expect(await knife.maxWallet()).to.equal(0n);

      await expect(knife.transfer(alice.address, SUPPLY)).to.not.be.reverted;
      expect(await knife.balanceOf(alice.address)).to.equal(SUPPLY);
    });

    it("handles cap = entire supply", async () => {
      const { knife, alice } = await deploy();
      await knife.setMaxWalletBeforeLaunch(SUPPLY);
      await knife.enableTrading();
      await expect(knife.transfer(alice.address, SUPPLY)).to.not.be.reverted;
    });

    it("handles cap = 1 wei", async () => {
      const { knife, alice } = await deploy();
      await knife.setMaxWalletBeforeLaunch(1n);
      await knife.enableTrading();

      await expect(knife.transfer(alice.address, 1n)).to.not.be.reverted;
      await expect(
        knife.transfer(alice.address, 1n)
      ).to.be.revertedWithCustomError(knife, "MaxWalletExceeded");
    });

    it("never caps an exempt recipient, at any size", async () => {
      const { knife, pair } = await deploy();
      await knife.setMaxWalletBeforeLaunch(1n);
      await knife.setLimitExempt(pair.address, true);
      await knife.enableTrading();

      await expect(knife.transfer(pair.address, SUPPLY)).to.not.be.reverted;
    });

    it("matches the oracle `balanceOf(to) + amount > cap` across 25 seeded cases", async () => {
      // mulberry32 — tiny deterministic PRNG so this test is reproducible run to run.
      let seed = 0x5eed;
      const rand = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const ONE = 10n ** 18n;
      let blocked = 0;
      let allowed = 0;

      for (let i = 0; i < 25; i++) {
        const { knife, alice } = await deploy();
        const capTokens = 1n + BigInt(Math.floor(rand() * 1_000_000_000));
        const cap = capTokens * ONE;

        await knife.setMaxWalletBeforeLaunch(cap);
        await knife.enableTrading();

        // Three shapes: exactly at the cap, one wei over, and a random amount under it.
        const mode = Math.floor(rand() * 3);
        const amount =
          mode === 0
            ? cap
            : mode === 1
            ? cap + 1n
            : BigInt(Math.floor(rand() * Number(capTokens))) * ONE;

        const held = await knife.balanceOf(alice.address); // 0n on a fresh deploy
        if (held + amount > cap) {
          blocked++;
          await expect(
            knife.transfer(alice.address, amount)
          ).to.be.revertedWithCustomError(knife, "MaxWalletExceeded");
        } else {
          allowed++;
          await expect(knife.transfer(alice.address, amount)).to.not.be.reverted;
          expect(await knife.balanceOf(alice.address)).to.equal(amount);

          // Same oracle again, now with a non-zero starting balance (accumulation).
          const top = 1n + BigInt(Math.floor(rand() * 1000)) * ONE;
          if (amount + top > cap) {
            await expect(
              knife.transfer(alice.address, top)
            ).to.be.revertedWithCustomError(knife, "MaxWalletExceeded");
          } else {
            await expect(knife.transfer(alice.address, top)).to.not.be.reverted;
          }
        }
      }

      // Guard against a future seed change quietly making this test vacuous: both the
      // enforced and the permitted branch must actually have been exercised.
      expect(blocked, "no over-cap case was generated").to.be.greaterThan(0);
      expect(allowed, "no under-cap case was generated").to.be.greaterThan(0);
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
