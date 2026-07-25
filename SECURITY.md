# Security & Static Analysis

Automated checks run against `contracts/MacTheKnife.sol`.

## Tooling

| Check | Command | Result |
|---|---|---|
| Unit tests | `npm test` | 50 passing |
| Coverage | `npm run coverage` | 100% statements / branches / functions / lines |
| Linter | `npx solhint "contracts/**/*.sol"` | clean |
| Production dependency audit | `npm run audit:production` | 0 vulnerabilities |
| Static analysis | `slither . --compile-force-framework hardhat --filter-paths node_modules` | 4 informational (see below) |
| Fork rehearsal | `npm run rehearse` | exact 10 BNB / 100% supply profile + LP burn + renounce + PancakeSwap buy/sell + Deadhand pass |

## Slither findings — triage

Slither reports **4 results, all the same detector**: `block-timestamp`
("uses timestamp for comparisons"), in `controlWindowOpen()`,
`controlWindowRemaining()`, `status()`, and `_update()`.

**Assessment: expected and safe. Not fixed by design.**

The Deadhand Cut is *intentionally* a time-based mechanism — the whole feature
is an immutable `controlDeadline` that KNIFE-specific launch powers expire against. A validator
can nudge `block.timestamp` by a few seconds, which is meaningless against a
control window measured in hours (72h on mainnet, and 72h is also the hard cap
in code — `MAX_CONTROL_WINDOW`). No value, balance, or access decision hinges on
second-level timestamp precision. This is the documented false-positive case for
the `block-timestamp` detector.

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
- The 72h figure is enforced, not just published: `MAX_CONTROL_WINDOW = 72 hours`
  and the constructor reverts (`ControlWindowTooLong`) above it, so the ceiling is
  provable from the verified bytecode rather than promised in marketing copy.
- **`transferOwnership` is not overridden.** During the control window the owner can
  hand the remaining launch powers to another address. This does not escalate
  anything — a new owner still cannot mint, tax, blacklist, or tighten the cap, and
  their powers still expire at the same immutable deadline — but it moves live powers
  to an unpublished address. Treated as an operational rule rather than a code
  restriction: DEPLOYMENT.md says don't do it, and OpenZeppelin's
  `OwnershipTransferred` log makes any such move permanently visible on-chain.
- After the deadline `transferOwnership` / `renounceOwnership` remain callable and
  confer nothing, since every power carries `duringControlWindow`. A non-zero
  `owner()` on a post-deadline contract holds no privileges.
- Sourcify verification is enabled by default and needs no API key. If a unified
  Etherscan key is present, Hardhat also submits through Etherscan v2.

## Dependency-audit boundary

`npm run audit:production` reports zero vulnerabilities. As of 2026-07-25, the full
development-tree audit reports 37 findings (14 low, 5 moderate, 18 high) inherited from Hardhat 2
and `solidity-coverage` transitive packages. `npm audit fix --dry-run` proposes zero non-breaking
changes; the suggested force fixes either migrate the Hardhat plugin line or downgrade coverage.
Those packages are
local compile/test/deploy tooling; none are included in KNIFE bytecode or the static site.
The lockfile is committed and launch work uses `npm ci` so the reviewed versions are
reproduced. Do not run the toolchain against untrusted projects, archives, RPC URLs, or
explorer endpoints.

## Reporting

Found something? Email allen@freshdigital.com.au. Please do not open a public
issue for a suspected vulnerability before it is addressed.
