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

Fill in `PRIVATE_KEY` (a **fresh burner wallet**, funded with a little BNB for gas) and
`BSCSCAN_API_KEY`. Never commit `.env`.

## 1. Deploy to BSC Testnet first (chain 97)

Get free test BNB from a BSC testnet faucet, then:

```bash
npm run deploy:testnet
```

The script prints the contract address, the total supply, the control deadline, and the
exact constructor args to use for verification. On testnet the control window is 1 hour so
you can watch the Deadhand Cut fire quickly.

## 2. Verify the source (so it's genuinely "open book")

```bash
npx hardhat verify --network bscTestnet <ADDRESS> "<DEPLOYER_ADDRESS>" <CONTROL_WINDOW_SECONDS>
```

If `hardhat verify` complains about the API (BscScan moved to the unified Etherscan v2 API
in 2024–25), either update `@nomicfoundation/hardhat-toolbox` or paste a unified Etherscan
key into `BSCSCAN_API_KEY`. Verification is what lets anyone read the guarantees for
themselves — don't skip it.

## 3. Launch sequence on mainnet (chain 56)

Deploy: `npm run deploy:mainnet` (control window defaults to **72 hours**).

Then, **in this order, while the control window is open:**

1. **Add liquidity.** Create the KNIFE/BNB (or KNIFE/USDT) pair on PancakeSwap and add the
   liquidity you intend to. Note the LP **pair address**.
2. **Exempt the pair + router** so the anti-snipe cap doesn't block the pool itself:
   `setLimitExempt(pairAddress, true)` and `setLimitExempt(routerAddress, true)`.
3. *(Optional)* **Set the anti-snipe cap** before opening: `setMaxWalletBeforeLaunch(...)`.
   Must be done before step 4 — it locks once trading opens.
4. **Open trading:** `enableTrading()`. This is one-way.
5. **Lock the LP tokens** (e.g. via a reputable locker) or burn them — and publish the lock.
   This is the other half of "un-ruggable"; the contract can't do it for you.
6. *(Optional)* **Remove limits** once the snipe risk has passed: `removeLimits()`.
7. **Renounce** to cut strings immediately: `renounceOwnership()`.

You don't strictly *need* step 7 — even if you skip it, all owner powers die automatically
at the 72-hour deadline. Renouncing just does it sooner and louder.

## The fairness guarantees (what verified holders can check)

| Guarantee | Enforced by |
|---|---|
| Supply can never grow | no mint function exists; `INITIAL_SUPPLY` minted once in constructor |
| Nobody can freeze your wallet | no blacklist/deny code anywhere |
| You always receive 100% | no fee/tax path in `_update` |
| Trading can't be paused to trap you | `enableTrading()` is one-way |
| The cap can't be tightened on you | `maxWallet` is settable only before launch |
| The token can't be locked forever | after `controlDeadline`, all transfers pass unconditionally |
| Owner powers are time-boxed | every owner function carries `duringControlWindow` |

## Pre-launch BNB budget

Two buckets: small fixed costs, and liquidity (your call).

**Fixed costs — gas + ops.** BSC gas is cheap (~1 gwei). Testnet is free (faucet BNB).

| Item | Approx (mainnet) |
|---|---|
| Deploy contract | ~0.003–0.006 BNB |
| `setLimitExempt` ×2, `enableTrading`, approve | ~0.005 BNB |
| Create pair + `addLiquidityETH` | ~0.004 BNB |
| `removeLimits` / `renounceOwnership` | ~0.002 BNB |
| BscScan verify | free |
| **Gas subtotal** | **~0.02 BNB — hold 0.05 as buffer** |

**LP lock fee** (reputable locker: PinkLock / UNCX / Team Finance): roughly
**0.1–0.5 BNB** or a flat ~$30–75 equivalent. Do it — an unlocked LP is the first
thing buyers check.

**Liquidity — the real number, and it's a decision, not a fixed fee.** The BNB you pair
with KNIFE *is* the launch pool: it sets the opening price and how easily the price moves.

| Liquidity depth | Character |
|---|---|
| ~1–5 BNB | thin — cheap but volatile and easy to manipulate; reads low-effort |
| ~10–25 BNB | credible small launch, steadier book |
| ~50–100+ BNB | serious launch, resists manipulation |

Pick a depth you are comfortable **locking**, not just spending. This runbook does not
advise how much to invest — that is your capital/risk decision.

**Bottom line:** the floor to *physically launch* is well under **1 BNB**
(~0.05 gas + ~0.1–0.5 LP lock). Everything above that is liquidity you choose. Keep a
little extra BNB aside for contingencies after launch.

## Pre-flight checklist (print this)

**Setup**
- [ ] Fresh burner deployer wallet created; funded with BNB (gas + LP lock + liquidity).
- [ ] `.env` filled (`PRIVATE_KEY`, `BSCSCAN_API_KEY`); confirmed git-ignored.
- [ ] `npm test` green. `npm run coverage` reviewed.
- [ ] `FORK=true npx hardhat run scripts/fork-rehearsal.js` passes (deploy → buy → sell → burn → Deadhand).

**Testnet (chain 97)**
- [ ] `npm run deploy:testnet`; address + constructor args recorded.
- [ ] Source verified on testnet.bscscan.com.
- [ ] Manual buy/sell on testnet PancakeSwap from a second wallet works.

**Mainnet (chain 56) — in order, while the control window runs**
- [ ] `npm run deploy:mainnet`; address recorded here + in README.
- [ ] Source verified on bscscan.com (green check) **before** any announcement.
- [ ] Liquidity added; pair address recorded.
- [ ] `setLimitExempt(pair, true)` and `setLimitExempt(router, true)`.
- [ ] *(optional)* `setMaxWalletBeforeLaunch(...)` — before opening only.
- [ ] `enableTrading()`.
- [ ] LP tokens locked or burned; **lock link published**.
- [ ] *(optional)* `removeLimits()` once snipe risk passes.
- [ ] *(optional)* `renounceOwnership()` to cut strings loudly (else auto at deadline).

**Public hygiene**
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
| LP lock link | _(fill)_ |
| Control deadline (unix) | _(fill)_ |

## What this repo intentionally does NOT do

No mainnet deploys or fund movements are automated for you — you sign those yourself. And
the "spoof / untraceable" lore stays lore: there is no de-anonymization, network spoofing,
or targeting logic in here, by design. hakky's edge is transparency, not trapdoors.
