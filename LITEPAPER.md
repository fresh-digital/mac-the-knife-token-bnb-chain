# MAC the KNIFE — $KNIFE
### A self-disarming, open-book token on BNB Chain
*Litepaper v0.1 · The MAC is the machine's face. The Knife removes it.*

---

## The one-paragraph version

$KNIFE is a fair-launch BEP-20 built around a single idea: **honesty as a weapon.** Many token rugs
depend on a hidden hand — a secret mint, a blacklist, a tax dial the deployer can turn. $KNIFE
is a contract that **amputates its own hand on a public timer.** At deploy it starts a 72-hour
countdown; when it hits zero, every KNIFE-specific launch power dies automatically and forever. No mint. No
blacklist. No trapdoor. The myth of Mac the Knife — the blade you never see coming — rendered as code
you can read before you touch it.

The full mythology lives in [the Codex](lore/CODEX.md). This document is the part you can verify.

---

## The thesis

In the story, hakky is the ex-Legion vigilante who kept the old creed when the collective sold its
mask. In reality, $KNIFE inherits his one law: **build nothing you can't sever from yourself.**

Scammers can copy the art, the name, the vibe, and even the source. They cannot quietly restore
the hidden hand without changing the bytecode and breaking these guarantees. That is the whole flex:
the difference remains independently checkable.

> The scare factor isn't "we can reach you." It's "we can do the one thing you never will — let go."

---

## The Deadhand Cut — the mechanic

The contract grants the deployer a small set of **honest launch chores** and nothing else, all of them
on a countdown:

1. **Deploy** mints the entire fixed supply once. There is no mint function afterward — supply can
   never grow.
2. During the **control window** (72h on mainnet) the deployer may only: open trading *once*, set an
   optional anti-snipe wallet cap *before* launch, and exempt the liquidity pair.
3. When the window closes, **every KNIFE-specific owner power reverts permanently.** Transfers are
   free regardless of the stored trading flag, the cap stops applying, and the token becomes
   ungoverned.
4. Critically, the token **cannot be frozen forever** — after the deadline all transfers pass by
   construction, even if the deployer vanishes. Liveness is guaranteed in the bytecode.

The launch profile renounces the `Ownable` slot immediately after configuration. Independently,
the timer makes expiry of every KNIFE-specific power inevitable even if renunciation is omitted.

---

## What you can verify (verify, don't trust)

Once the source and ABI are verified on Sourcify, every one of these is checkable by anyone:

| Guarantee | What it means for you | Enforced by |
|---|---|---|
| Fixed supply | Nobody can print more and dump on you | no `mint` function exists |
| No blacklist | Your wallet can never be frozen | no deny/freeze code anywhere |
| No transfer tax | You receive 100% of every transfer | no fee path in `_update` |
| One-way trading | Trading can't be paused to trap you | `enableTrading()` can't be undone |
| Limits only loosen | The cap can't be tightened onto you | `maxWallet` settable only pre-launch |
| Guaranteed liveness | The token can't be locked forever | after the deadline, all transfers pass |
| Time-boxed control | The deployer's power has an expiry date | every owner call carries `duringControlWindow` |

Call `status()` on the contract and it returns the whole safety picture — trading state, cap, the
countdown deadline, whether ownership is renounced, and total supply — in a single read.

---

## Tokenomics

| Field | Value |
|---|---|
| Name / Symbol | Mac the Knife / **KNIFE** |
| Decimals | 18 |
| Total supply | 1,000,000,000 (fixed, minted once) |
| Transfer tax | **0%** |
| Chain | BNB Smart Chain (56) |
| Owner powers | expire ≤ 72h after deploy, by construction |
| Team allocation | **none** — the frozen launch profile puts 100% of supply into liquidity |

**Fair-launch stance:** the frozen Open Book launch pairs all 1,000,000,000 KNIFE with 10 BNB,
burns every deployer LP token, and renounces ownership. A 1% max wallet remains until the
immutable 72-hour deadline, then becomes unenforced automatically. There is no team allocation,
private sale, unlocked LP position, tax, or revenue promise.

---

## Launch sequence (public, in this order)

1. Deploy to BSC Testnet, verify source, rehearse the full lifecycle (the countdown is 1h on testnet).
2. Deploy to mainnet → **verify source immediately.**
3. Add 100% of supply + 10 BNB on PancakeSwap; exempt pair/router; set the 1% cap; open trading.
4. Send every deployer LP token permanently to `0x…dEaD` and publish the burn transaction.
5. Renounce ownership immediately. The public Deadhand countdown independently proves when all
   KNIFE-specific launch powers would have expired in any case.

Full operator runbook: [DEPLOYMENT.md](DEPLOYMENT.md).

---

## The Collective

Holders are the Legion reborn — *transparent this time.* Not anonymous-as-in-hidden; anonymous-as-in-
everyone. Membership is not a form; it's reading the contract and carrying the creed:

> We do not forgive the rug. We do not forget the wallet. We wear no master. **Expect the Cut.**

---

## Honest risks (read this)

$KNIFE is a **meme/culture token**, not an investment, a security, or a promise. It has no revenue, no
yield, and no roadmap that entitles you to anything. Its "utility" is the myth and the verifiable
fairness of its contract — nothing more. Crypto assets are volatile and can go to zero. Smart contracts
can contain bugs even when transparent; get an independent audit before trusting real value to this or
any contract. Do your own research. Nothing here is financial advice, and no price or return is
promised or implied.

*This document describes a fictional universe alongside a real contract. The fiction is clearly
labeled as such in the Codex; the contract claims are the ones you should verify on-chain.*
