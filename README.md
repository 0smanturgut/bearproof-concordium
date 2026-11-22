# BEARPROOF on Concordium: an accountable AI game studio

An entry for the Concordium Trusted Agents Hackathon. The plan: BEARPROOF's build agent and its
replay-verifier agent are registered in the Concordium Agent Registry with Verified badges; the
project's existing Solana prize-wallet key is bound to the agent with CIS-8; replay verification is
sold to other agents over x402 in a PLT with sponsored fees; every build, verdict and prize leaves a
receipt anchored on Concordium; and prizes are released only to players who pass a zero-knowledge
age proof. Concordium testnet.

## Status

22 Nov 2026:

- Written: the two Agent Cards ([`agent-card/`](agent-card/)), a zero-dependency library and scripts
  that validate a card, print the exact hash the registry pins, read the testnet registry, and build
  the unsigned register / setAgentURI / CIS-8 transactions, plus the operator's steps
  ([docs/register.md](docs/register.md)). Tests run offline; live read-only checks run with `LIVE=1`.
- Not done: nothing is registered, no card is hosted, no badge exists, and no transaction has been
  signed or sent. Both agents are described as they ran in BEARPROOF 1.0; neither is running now.
- Not started: x402, receipts and the age-proof gate.

No number on this page is a result. This section is updated as each part ships.

## Pre-existing work and what is new

- Pre-existing (not part of this submission): the BEARPROOF game, its deterministic simulation and
  replay verifier, built 23 Sep – 31 Oct 2026 in
  [github.com/0smanturgut/bearproof](https://github.com/0smanturgut/bearproof) (MIT; a fork of
  [ricardo-foundry/canvas-vampire-survivors](https://github.com/ricardo-foundry/canvas-vampire-survivors),
  credited). Pinned as a dependency at tag
  [`v1.0-final`](https://github.com/0smanturgut/bearproof/tree/v1.0-final) (`48f8560`).
- Built during the Concordium Trusted Agents Hackathon (Encode Club, build window 19 Nov – 9 Dec 2026), from 22 Nov 2026: everything in this repository. First commit: 22 Nov 2026
  (`git log --reverse`).
  Game-side changes made for this event live in the game repository after the tag
  [`concordium-start`](https://github.com/0smanturgut/bearproof/tree/concordium-start).
- Related submissions: the same game is also entered at CoinMarketCap API Hackathon Round 2 (DoraHacks); Agent ID Hackathon (BNB Chain); Celo "Agents Open for Business" (Loops House); Reactive Omni Buildathon (DoraHacks); X Layer TapeOut Accelerate. Each entry has its own repository,
  integration and contracts. Shared code lives in
  [proofkit](https://github.com/0smanturgut/proofkit), written from 22 Nov 2026.
- AI use: see [AI_USAGE.md](AI_USAGE.md).
- Test traffic: transactions from wallets the team controls are listed in [CLAIMS.md](CLAIMS.md)
  and are not counted as users.

## Layout

- `agent-card/`: the two source Agent Cards; hosted releases go to `agent-card/published/<release>/`
  (none yet). See [docs/agent-cards.md](docs/agent-cards.md) for the hash rule and the hosting decision.
- `src/`: the library (ES modules, fetch and WebCrypto only, so it also runs in a Cloudflare Worker):
  networks, Base58Check, badge, card validation, parameter and CIS-8 encoders, registry clients.
- `scripts/card.mjs`: validate, hash, compose and check a hosted card.
- `scripts/registry.mjs`: testnet reads (status, check-badge, badge block, agent, owner) and unsigned
  transaction builders. It never signs or submits.
- `scripts/cis8-sign-solana.mjs`: an offline signer the operator runs on his own machine for the CIS-8
  link of the Solana prize-wallet key.
- `docs/`: [register.md](docs/register.md) (operator steps), [api-notes.md](docs/api-notes.md) (what the
  live services did), [planned-services.md](docs/planned-services.md) (planned, in no card).

Planned, not started: `x402/` (the facilitator and the paid verdict endpoint), `zk/` (the age-proof
gate), `receipts/` (anchoring receipts in the registry).

## Run the checks

```bash
npm test                         # offline
LIVE=1 npm test                  # adds read-only calls to the testnet registry services
node scripts/secret-scan.mjs
node scripts/card.mjs validate   # the cards
node scripts/registry.mjs status # testnet contracts, node and indexer
```

A [CrowLab](https://crowlab.ai) project. MIT licensed.
