# Mac the Knife (KNIFE) — BNB Chain

> The MAC is the machine's face. The Knife removes it.

An **open-book, self-disarming fair-launch** BEP-20 on BNB Chain (BSC). The lore is a hooded
ex-Anonymous scam-hunter — **hakky**. The product backing the lore is the opposite of a scam: a
token whose fairness is proven by its own bytecode, not by anyone's promise.

## The unique hook: The Deadhand Cut

Many token rugs rely on the deployer keeping secret levers — a hidden mint, a blacklist, a tax dial.
hakky's myth is *"the Knife removes it,"* so this token points the blade at **its own** control.

At deployment an **immutable countdown** (72 hours on mainnet) is burned into the contract. While
it runs, the deployer can do only honest launch chores — open trading once, set an optional
anti-snipe cap. The instant it hits zero, **every KNIFE-specific owner power dies automatically and forever**,
whether or not the deployer renounces. After that: no gate, no enforced cap, and no
KNIFE-specific owner power. The Open Book launch profile also renounces the `Ownable` slot
immediately. By construction the token can **never be permanently frozen**, because the code
guarantees it goes free at the deadline no matter what the deployer does or forgets.

Most tokens ask you to *trust* they'll renounce. This one severs its own strings on a public timer
you can watch tick down on-chain. Anyone can copy the code; what they cannot do while preserving
these guarantees is quietly add back the trapdoors this contract refuses to have.

## Provable guarantees (source and ABI verified on Sourcify)

| Guarantee | Enforced by |
|---|---|
| Supply can never grow | no mint function; `INITIAL_SUPPLY` minted once in the constructor |
| Nobody can freeze your wallet | no blacklist / deny code anywhere |
| You always receive 100% | no fee/tax path in `_update` |
| Trading can't be paused to trap you | `enableTrading()` is one-way |
| The cap can't be tightened on you | `maxWallet` settable only before launch |
| The token can't be locked forever | after `controlDeadline`, all transfers pass unconditionally |
| KNIFE launch powers are time-boxed | every KNIFE-specific owner function carries `duringControlWindow` |
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
| Control window | 72h mainnet / 1h testnet (hard-capped at 72h in code — `MAX_CONTROL_WINDOW`) |

## Frozen Open Book launch profile

The mainnet release has one rehearsed path: **100% of KNIFE plus 10 BNB** enters a single
PancakeSwap V2 pool, a **1% max wallet** applies until the 72-hour deadline, every deployer
LP token is sent permanently to `0x…dEaD`, and ownership is renounced. There is no founder
token allocation and no unlocked LP position. The human-held launch wallet needs **10.25 BNB**
including the transaction buffer.

## Repo layout

```
contracts/MacTheKnife.sol   the token — every guarantee above lives here
test/MacTheKnife.test.js     full fairness test suite (run: npm test)
scripts/deploy.js            deploy + print constructor args for verification
scripts/open-book-launch.js  guarded mainnet launch + public records
scripts/inspect-launch.js    read-only interrupted-launch receipt inspection
hardhat.config.js            BSC mainnet/testnet + verification config
DEPLOYMENT.md                launch runbook — read before mainnet
```

## Quick start

```bash
npm install
npm run release:check
npm run rehearse
```

Then follow [DEPLOYMENT.md](DEPLOYMENT.md). The exact BSC-mainnet fork rehearsal is required;
the live testnet signer/verification drill is optional.

The pre-launch site publishes from `site/` through GitHub Pages. Until a custom domain is
deliberately configured, the canonical host is:
`https://fresh-digital.github.io/mac-the-knife-token-bnb-chain/`.

## Scope & boundaries

- **Real:** the token, tests, testnet deploy + verify flow, and launch guidance.
- **Lore only:** "spoof / cut / disappear / untraceable." Great on a poster; there is deliberately
  **no** de-anonymization, network spoofing, or targeting logic in this code. hakky's edge is
  transparency, not trapdoors.
- **You sign the live stuff:** the deterministic mainnet script runs only from the human-held
  wallet after an exact irreversible-action confirmation. Codex never handles the key or runs it.
- The contract is designed to be *non*-honeypot; hidden mint, blacklist, or unremovable taxes will
  never be added, because that would make it the very thing it hunts.
