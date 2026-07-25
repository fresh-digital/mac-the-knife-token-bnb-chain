# AGENTS.md — Mac the Knife (KNIFE)

Fair-launch BEP-20 on BNB Chain whose owner powers self-destruct on an immutable
72h timer (the "Deadhand Cut"). Full pitch and guarantees: [README.md](README.md).
Launch runbook: [DEPLOYMENT.md](DEPLOYMENT.md).

## Commands

```bash
npm install          # once per machine
npm test             # full fairness suite — needs NO .env
npx hardhat run scripts/deploy.js --network bscTestnet   # needs .env (see .env.example)
```

## Hard rules (do not relax)

- **Scope boundary:** the "scam-hunter" lore (spoof / cut / de-anonymize) is fiction for
  marketing only. Never add de-anonymization, targeting, spoofing, or any offensive tooling
  to this repo — the product's entire edge is provable transparency.
- **Anti-scam invariants in `contracts/MacTheKnife.sol` are load-bearing:** no mint, no
  blacklist, no tax path, one-way `enableTrading()`, all owner powers dead after
  `controlDeadline`. Any change that weakens one of these defeats the token's reason to exist;
  `test/MacTheKnife.test.js` must keep proving them.
- **Secrets:** `.env` is per-machine and never committed (deployer key = burner wallet only).
  On a new machine, copy `.env.example` → `.env` and refill. Codex never handles the real key.
- Mainnet deployment and liquidity transactions are executed by the human, never by Codex.

## Layout

- `contracts/` `scripts/` `test/` — the real product (Hardhat, Solidity 0.8.24, evm `paris`)
- `lore/` `marketing/` `site/` — hakky mythology, copy, and static site (fiction lives here)
