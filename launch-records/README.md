# Launch records

The mainnet launcher writes two public, key-free artifacts after a successful launch:

- `56-<token>.json` — final addresses, amounts, deadline, and transaction hashes.
- `56-<token>.journal.json` — the ordered broadcast and confirmation journal.

During a launch, `pending-mainnet.json` is written before the first transaction and updated
after every broadcast and confirmation. It is git-ignored. If that file survives, the launch
was interrupted: **do not rerun the launcher**. Use `npm run inspect:launch:mainnet` (or the
backup-RPC variant) to read the receipts and current contract state without signing anything.

No private key, seed phrase, or other secret is ever written here.
