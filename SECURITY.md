# Security & Static Analysis

Automated checks run against `contracts/MacTheKnife.sol`.

## Tooling

| Check | Command | Result |
|---|---|---|
| Unit tests | `npm test` | 23 passing |
| Coverage | `npm run coverage` | 100% statements / lines / functions |
| Linter | `npx solhint "contracts/**/*.sol"` | clean |
| Static analysis | `slither . --compile-force-framework hardhat --filter-paths node_modules` | 3 informational (see below) |
| Fork rehearsal | `FORK=true npx hardhat run scripts/fork-rehearsal.js` | deploy + PancakeSwap buy/sell + burn + Deadhand all pass |

## Slither findings — triage

Slither reports **3 results, all the same detector**: `block-timestamp`
("uses timestamp for comparisons"), in `controlWindowOpen()`, `status()`,
and `_update()`.

**Assessment: expected and safe. Not fixed by design.**

The Deadhand Cut is *intentionally* a time-based mechanism — the whole feature
is an immutable `controlDeadline` that owner powers expire against. A validator
can nudge `block.timestamp` by a few seconds, which is meaningless against a
control window measured in hours (72h on mainnet, hard-capped at 7 days). No
value, balance, or access decision hinges on second-level timestamp precision.
This is the documented false-positive case for the `block-timestamp` detector.

There are **no** medium/high severity findings: no reentrancy, no unchecked
external calls, no arbitrary-send, no delegatecall, no tx.origin auth.

## Manual review notes

- Fixed supply: minted once in the constructor; no `mint`/minter role exists.
- No blacklist, freeze, or per-address deny path.
- No fee/tax path in `_update` — transfers deliver 100%.
- Owner powers (`enableTrading`, `setMaxWalletBeforeLaunch`, `removeLimits`,
  `setLimitExempt`) all carry `duringControlWindow` and are one-way toward
  *looser*, never tighter, and die permanently at the deadline.
- Liveness: after `controlDeadline` the restriction branch in `_update` is
  skipped entirely, so the token can never be permanently frozen.

## Reporting

Found something? Email allen@freshdigital.com.au. Please do not open a public
issue for a suspected vulnerability before it is addressed.
