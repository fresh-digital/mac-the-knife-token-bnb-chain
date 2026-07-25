# Deployment & Launch Runbook — Mac the Knife (KNIFE)

> Read this fully before touching mainnet. The launch **order** matters: the Deadhand
> countdown starts the moment you deploy, and some steps can only be done while it runs.

## 0. One-time setup

```bash
npm install
npm run compile
npm test        # all fairness guarantees should pass before you go near a live network
```

Then create your secrets file:

```bash
cp .env.example .env
```

Fill in `PRIVATE_KEY` with a **fresh launch wallet**. Both 64 hex characters and the
`0x`-prefixed form are accepted. Never commit `.env`.

`BSCSCAN_API_KEY` is optional. Sourcify verification is enabled by default and needs no
account or key. If you also want automated Etherscan/BscScan submission, use a unified
Etherscan key; BSC API access may require a paid Etherscan plan.

## 1. Optional BSC Testnet signer/verification drill (chain 97)

The required full launch simulation is `npm run rehearse`, because it executes the exact frozen
profile against PancakeSwap V2 state on a pinned BSC mainnet fork. A testnet contract-only deploy
does not recreate that liquidity path.

If you want an additional live-wallet and source-verification drill, get free test BNB from a BSC
testnet faucet, then:

```bash
npm run deploy:testnet
```

The script prints the contract address, the total supply, the control deadline, and the
exact constructor args to use for verification. On testnet the control window is 1 hour so
you can watch the Deadhand Cut fire quickly.

## 2. Verify the testnet source

```bash
npm run verify:testnet -- <ADDRESS> "<DEPLOYER_ADDRESS>" 3600
```

With no API key this verifies on Sourcify. With `BSCSCAN_API_KEY` present, Hardhat submits
to Etherscan v2 and Sourcify. BscScan also provides a web-based **Verify and Publish**
fallback if API access is unavailable.

If the RPC (not the explorer API) is stalling, retry on the backup route — same chain,
different node operator:

```bash
npm run verify:testnet:backup -- <ADDRESS> "<DEPLOYER_ADDRESS>" 3600
```

Verification is what lets anyone read the guarantees for themselves — don't skip it.

## 3. Frozen Open Book mainnet profile (chain 56)

The release candidate has one mainnet trajectory. It is deliberately small and simple:

| Item | Frozen value |
|---|---|
| KNIFE in initial LP | 1,000,000,000 — 100% of fixed supply |
| BNB in initial LP | 10 BNB |
| Initial pool | PancakeSwap V2 KNIFE/BNB |
| Max wallet | 10,000,000 KNIFE (1%) |
| Max-wallet duration | until the 72h control deadline |
| LP ownership | every deployer LP token sent permanently to `0x…dEaD` |
| Contract ownership | renounced immediately after configuration |
| Source verification | Sourcify before liquidity/trading; BscScan may be added afterward |

There is no founder token allocation and no unlocked LP position. The deployer finishes with
zero KNIFE, zero LP tokens, and a zero `owner()` slot. The 1% cap cannot be removed after
renunciation, but the contract stops enforcing it automatically at the immutable 72-hour
deadline.

The human operator runs:

```powershell
$env:CONFIRM_OPEN_BOOK_LAUNCH="DEPLOY_10_BNB_AND_BURN_LP"
npm run preflight:mainnet
npm run launch:mainnet
```

The safety phrase is intentionally awkward. The script refuses mainnet without it. It checks
chain 56, wallet balance, current PancakeSwap Router V2 bytecode, the exact pool reserves, LP
burn receipt, trading state, and renounced ownership. It writes:

- `launch-records/56-<contract>.json` — addresses, amounts, deadline, and every transaction.
- `site/launch-config.js` — replaces the honest pre-launch placeholders with the real contract,
  pair, BscScan link, PancakeSwap link, and on-chain deadline.

If the primary RPC is unhealthy **before any launch transaction is broadcast**, rerun both
commands using `preflight:mainnet:backup` and `launch:mainnet:backup`. They address the same
chain and wallet.

If the launcher stops after broadcasting anything, **do not rerun it on either RPC**. The
launcher preserves `launch-records/pending-mainnet.json` and refuses a second deployment.
Resolve the receipts and current token state without signing anything:

```powershell
npm run inspect:launch:mainnet
# or, if the primary RPC is unavailable:
npm run inspect:launch:mainnet:backup
```

The inspection output is the evidence for a narrow recovery decision. Never delete the pending
journal just to make the launch command run again.

### No separate contract-only mainnet deploy

`scripts/deploy.js` refuses chain 56. This prevents starting the irreversible 72-hour clock
without completing the matching source verification, pool creation, LP burn, and renunciation
flow. Do not bypass this guard with an ad-hoc deployment command.

## The fairness guarantees (what verified holders can check)

| Guarantee | Enforced by |
|---|---|
| Supply can never grow | no mint function exists; `INITIAL_SUPPLY` minted once in constructor |
| Nobody can freeze your wallet | no blacklist/deny code anywhere |
| You always receive 100% | no fee/tax path in `_update` |
| Trading can't be paused to trap you | `enableTrading()` is one-way |
| The cap can't be tightened on you | `maxWallet` is settable only before launch |
| The token can't be locked forever | after `controlDeadline`, all transfers pass unconditionally |
| KNIFE launch powers are time-boxed | every KNIFE-specific owner function carries `duringControlWindow` |
| The 72h figure isn't just marketing | `MAX_CONTROL_WINDOW = 72 hours` — the constructor rejects anything longer, so the ceiling is provable from the verified bytecode |

## Required mainnet BNB

The frozen profile consumes **10 BNB as permanent pool liquidity**. The mainnet preflight
requires another **0.1 BNB transaction buffer**, so the hard minimum is **10.1 BNB**.

Fund the fresh launch wallet with **10.25 BNB**. That leaves 0.15 BNB above the profile for
gas variability and a small post-launch contingency. The LP burn has no locker fee, but it is
irreversible: the 10 BNB pool position cannot later be withdrawn or migrated.

## Pre-flight checklist (print this)

**Setup**
- [ ] Fresh burner deployer wallet created; funded with BNB (permanent pool liquidity + gas).
- [ ] `.env` filled (`PRIVATE_KEY`); confirmed git-ignored.
- [ ] `npm run release:check` green.
- [ ] `npm run rehearse` passes the exact frozen profile against PancakeSwap V2 on a pinned
      BSC fork. It selects a fork RPC/block automatically. The **sell** leg is the honeypot
      check; if it ever fails, do not launch.

**Optional testnet signer drill (chain 97)**
- [ ] `npm run deploy:testnet`; address + constructor args recorded.
- [ ] Source verified on testnet.bscscan.com.

**Mainnet (chain 56)**
- [ ] Fresh wallet funded with 10.25 BNB.
- [ ] Exact confirmation phrase set.
- [ ] `npm run preflight:mainnet` passes.
- [ ] Human runs `npm run launch:mainnet` once.
- [ ] Generated launch record shows 10 BNB pool, 100% supply, 1% cap, LP burn, and renunciation.
- [ ] Sourcify source link and BscScan contract page published before any announcement.

**Public hygiene**
- [ ] GitHub Pages deployment is green and its public URL visibly says `NOT DEPLOYED` before mainnet.
- [ ] Contract address published only through official channels (scammers front-run announcements).
- [ ] Honeypot checkers (honeypot.is, GoPlus) run and linked clean.
- [ ] BscScan token info + logo submitted (`assets/brand/knife-avatar-400.png`).
- [ ] Pinned manifesto posted (`marketing/pinned-manifesto.md`).

## Launch record

| Item | Value |
|---|---|
| Mainnet token address | _(fill after deploy)_ |
| Testnet token address | _(fill)_ |
| LP pair address | _(fill)_ |
| LP burn transaction | _(generated by launch script)_ |
| Control deadline (unix) | _(fill)_ |

## What this repo intentionally does NOT do

The mainnet script prepares and submits the frozen transaction sequence only when the human
operator supplies the launch wallet and exact confirmation phrase. Codex never handles the
key or runs the mainnet command. The "spoof / untraceable" lore stays lore: there is no
de-anonymization, network spoofing, or targeting logic here.

## Website publishing

`.github/workflows/pages.yml` publishes the contents of `site/` to GitHub Pages on every
`main` change. The default public URL requires no domain or hosting account:

`https://fresh-digital.github.io/mac-the-knife-token-bnb-chain/`

The launch script replaces `site/launch-config.js` with the real token, pair, proof links, and
deadline. Commit and merge that generated file together with the public launch record immediately
after the human-signed launch; Pages then updates without a separate web-hosting step.

`mactheknife.xyz` currently remains optional. If it is later pointed at GitHub Pages, configure the
custom domain in repository settings before changing DNS, verify domain ownership, and follow
GitHub's current custom-domain documentation. Do not advertise the parked domain as live.
