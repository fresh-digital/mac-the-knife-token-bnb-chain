# Mac the Knife (KNIFE) — BNB Chain

> The MAC is the machine's face. The Knife removes it.

An **open-book, self-renouncing fair-launch** BEP-20 on BNB Chain (BSC). The lore is a hooded
ex-Anonymous scam-hunter — **hakky**. The product backing the lore is the opposite of a scam: a
token whose fairness is proven by its own bytecode, not by anyone's promise.

## The unique hook: The Deadhand Cut

Every rug relies on the deployer keeping secret levers — a hidden mint, a blacklist, a tax dial.
hakky's myth is *"the Knife removes it,"* so this token points the blade at **its own** control.

At deployment an **immutable countdown** (72 hours on mainnet) is burned into the contract. While
it runs, the deployer can do only honest launch chores — open trading once, set an optional
anti-snipe cap. The instant it hits zero, **every owner power dies automatically and forever**,
whether or not the deployer renounces. After that: no gate, no cap, no owner — and by construction
the token can **never be permanently frozen**, because the code guarantees it goes free at the
deadline no matter what the deployer does or forgets.

Most tokens ask you to *trust* they'll renounce. This one severs its own strings on a public timer
you can watch tick down on-chain. That's what makes scammers nervous: it's the anti-scam token they
can't copy, because their whole model depends on the trapdoors this one refuses to have.

## Provable guarantees (verifiable on BscScan once verified)

| Guarantee | Enforced by |
|---|---|
| Supply can never grow | no mint function; `INITIAL_SUPPLY` minted once in the constructor |
| Nobody can freeze your wallet | no blacklist / deny code anywhere |
| You always receive 100% | no fee/tax path in `_update` |
| Trading can't be paused to trap you | `enableTrading()` is one-way |
| The cap can't be tightened on you | `maxWallet` settable only before launch |
| The token can't be locked forever | after `controlDeadline`, all transfers pass unconditionally |
| Owner powers are time-boxed | every owner function carries `duringControlWindow` |
| One-call transparency | `status()` returns the whole safety picture in a single view |

## Tokenomics (confirmed defaults)

| Field | Value |
|---|---|
| Name | Mac the Knife |
| Symbol | KNIFE |
| Decimals | 18 |
| Total supply | 1,000,000,000 (fixed, minted once) |
| Transfer tax | 0% |
| Chain | BNB Smart Chain (56) — testnet: BSC Testnet (97) |
| Control window | 72h mainnet / 1h testnet (hard-capped at 7 days in code) |

## Repo layout

```
contracts/MacTheKnife.sol   the token — every guarantee above lives here
test/MacTheKnife.test.js     full fairness test suite (run: npm test)
scripts/deploy.js            deploy + print constructor args for verification
hardhat.config.js            BSC mainnet/testnet + verification config
DEPLOYMENT.md                launch runbook — read before mainnet
```

## Quick start

```bash
npm install
npm test
```

Then follow [DEPLOYMENT.md](DEPLOYMENT.md) — testnet first.

## Scope & boundaries

- **Real:** the token, tests, testnet deploy + verify flow, and launch guidance.
- **Lore only:** "spoof / cut / disappear / untraceable." Great on a poster; there is deliberately
  **no** de-anonymization, network spoofing, or targeting logic in this code. hakky's edge is
  transparency, not trapdoors.
- **You sign the live stuff:** mainnet deployment and liquidity are yours to execute — this repo
  never moves funds or fires on-chain transactions for you.
- The contract is designed to be *non*-honeypot; hidden mint, blacklist, or unremovable taxes will
  never be added, because that would make it the very thing it hunts.
