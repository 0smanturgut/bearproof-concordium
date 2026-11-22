# Agent Cards

BEARPROOF registers two agents in the Concordium Agent Registry (CIS-8004) on testnet. Each has an Agent
Card: one JSON file that is both an ERC-8004 registration file and an A2A v1.0 Agent Card, with the
"Verified by Concordium" badge as an A2A extension
([Agent Card spec](https://docs.concordium.com/en/mainnet/technical-reference/agent-registry/agent-card.html),
[badge spec](https://docs.concordium.com/en/mainnet/technical-reference/agent-registry/concordium-badge.html)).

Status, 22 Nov 2026: both cards are written. Nothing is registered and no card is hosted yet.

| Agent                     | Source card                                                     | What it is                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| BEARPROOF Build Agent     | [`agent-card/build-agent.json`](../agent-card/build-agent.json) | The scheduled AI developer that wrote Builds #3 to #31 of BEARPROOF 1.0 (25 Sep – 23 Oct 2026). Not running since 31 Oct 2026.                     |
| BEARPROOF Replay Verifier | [`agent-card/replay-verifier.json`](../agent-card/replay-verifier.json) | Deterministic code that re-simulates a run's input log against the exact build it was played on. Ran in 1.0; not accepting runs since 31 Oct 2026. |

## What the cards say, and where each fact comes from

Every sentence in the cards is checkable in the game repository at tag
[`v1.0-final`](https://github.com/0smanturgut/bearproof/tree/v1.0-final):

- Builds #3 to #31 have `mode: agent` and `costMeasured: true` in their devlog front matter, dated
  2026-09-25 to 2026-10-23; Builds #1 and #2 have `mode: bootstrap` (`devlog/build-*.md`).
- The guardrails, the test and smoke-test gate, and who did what: the README's "What's in it" and
  "Who does what".
- The verifier's rule (verified only when score, time, kills and level are reproduced exactly; rejected
  with a reason; unverifiable without a deterministic sim) and that it ran as a scheduled GitHub Actions
  job: `scripts/verify-runs.mjs` and `.github/workflows/verify.yml`.
- The stop on 31 Oct 2026: DECISIONS D84.

What the cards deliberately do not have yet:

- `active: false` on both: the card field means "operational", and neither agent runs today.
- `x402Support: false`, `supportedInterfaces: []`, and no A2A or MCP service: no endpoint of ours exists
  yet. The only `services` are the game site and its source. What is planned is in
  [planned-services.md](planned-services.md), outside any card.
- No badge extension in the source cards: the badge needs the owner's testnet account, and after mint
  the token id. It is added when the hosted card is composed (below).
- `registrations: []` until the agent is minted.

`npm test` enforces these (no "live", "nightly" or self-funding wording, only known URLs, not active).

## The hash the registry checks

The registry anchors `metadata_hash` = **SHA-256 of the raw bytes served at `agent_uri`**. The docs say a
consumer verifies "by fetching agent_uri, computing the SHA-256 hash of the raw response body, and
comparing it to the metadata_hash stored on-chain", and "Hash the served bytes — what a verifier will
fetch, not the file on disk". It is not a hash of canonical JSON, so the shared proofkit canonical-JSON
hash is not used for cards; a re-indented copy of the same JSON has a different hash.

So:

- A hosted card is a file committed byte for byte. Our layout is `JSON.stringify(card, null, 2)` plus one
  trailing newline (`cardText()` in `src/card.js`), so anyone can rebuild the exact bytes from the
  JSON. `.gitattributes` marks the card files `-text` so git never converts line endings.
- `node scripts/card.mjs hash <file>` prints the hash of a file's bytes;
  `curl -s <agent_uri> | shasum -a 256` gives the same number for the served copy, and
  `node scripts/card.mjs check-hosted ...` compares the two.
- Checked on 22 Nov 2026: `build_agent_card` returns `metadata_hash_hex` = SHA-256 of its
  `agent_card_json` string exactly; and a testnet card served from raw.githubusercontent.com hashes to
  its on-chain `metadata_hash` and passes `check-badge` (`test/card.test.mjs`).

## Where each card is hosted: an immutable GitHub raw URL at a tag of this repository

Decision: `agent_uri` =
`https://raw.githubusercontent.com/0smanturgut/bearproof-concordium/refs/tags/<release>/agent-card/published/<release>/<agent>.json`,
for example `.../refs/tags/cards-v1/agent-card/published/cards-v1/build-agent.json`.

Why this and not a bearproof.app path:

- **Byte-identical, and shown to work.** raw.githubusercontent.com serves the blob's exact bytes (the
  SHA-256 of a file fetched at a tag equalled `git show <tag>:<file>`), and testnet cards hosted there pass
  `check-badge` with `hash_matches_on_chain: true`. The `text/plain` content type does not matter to the
  check.
- **Immutable.** A URL at a tag in a versioned folder names one version of one file. The badge docs
  recommend exactly this for updates: "host at a new versioned URL and pass agent_uri together with
  metadata_hash_hex in one transaction", so the served card and the on-chain hash never disagree.
  GitHub's 5-minute raw cache cannot serve a stale copy of a URL that never changes.
- **Auditable.** The card's history is this repository's history; judges can diff the releases.
- **bearproof.app was weighed and not chosen.** It deploys from the game repository's `main`, so any
  later deploy could change the bytes and break the badge without anyone touching this repo. The site is
  in its stopped state, and adding a path means a deploy in another repository. A domain also has only
  one `/.well-known/agent-card.json` for two agents. A byte-identical mirror there can be added later for
  A2A discovery, but it is never the anchored `agent_uri`.

Rules that keep the URLs immutable:

1. A file under `agent-card/published/` is never edited. `card.mjs compose` refuses to overwrite one.
2. A release tag (`cards-v1`, `cards-v2`, ...) is never moved or deleted. A changed card is a new release
   folder, a new tag, and one `setAgentURI` with the new URL and hash.
3. Each release folder has a `SHA256SUMS` file (`sha256sum -c` format) that `card.mjs validate` checks.
4. Optional hardening (operator, GitHub settings): a tag ruleset for `cards-v*` that blocks update and
   deletion.

## Two passes: register, then add the badge

A badge needs the token id, which exists only after `register` mints it, so (as the badge docs describe):

1. `cards-v1`: each card with the badge in its pre-mint form (`tokenAddress: null`, `verifyUrl` keyed on
   the owner account), composed with `card.mjs compose --owner <account>`. Register the agent with this
   URL and hash.
2. `cards-v2`: `card.mjs compose --owner <account> --token-id <n>` fetches the badge block from
   `/v1/get-badge-JSON/<badge>`, checks it equals the documented form, and adds the ERC-8004
   `registrations` entry. Pin it with one `setAgentURI` (new URL + new hash).
3. `check-badge` must then show `badge_valid`, `extension_conformant` and `verification_present` true
   with no issues.

The click-by-click version is [register.md](register.md).

## Accounts

Both agents are owned by accounts of one testnet identity (the operator's, from "Concordium testnet IP"),
one account per agent:

- **build-agent account**: owns the BEARPROOF Build Agent.
- **verifier account**: owns the BEARPROOF Replay Verifier, and is the account the 1.0 Solana prize
  wallet `GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5` is bound to with CIS-8; the verifier agent then
  carries that key as its external reference. Reason: in 1.0 that wallet paid Daily prizes only to runs the
  verifier had marked verified, while the build agent never touched prize money (its guardrails kept it
  out of payout code), so binding the wallet to the build agent would overstate what it did.

Separate accounts keep each agent's history, fees and later payments apart, and each new account can take
the testnet faucet once.
