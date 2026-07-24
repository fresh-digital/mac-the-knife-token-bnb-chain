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

## What this repo intentionally does NOT do

No mainnet deploys or fund movements are automated for you — you sign those yourself. And
the "spoof / untraceable" lore stays lore: there is no de-anonymization, network spoofing,
or targeting logic in here, by design. hakky's edge is transparency, not trapdoors.
