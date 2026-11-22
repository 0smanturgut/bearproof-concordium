# BEARPROOF on Concordium: an accountable AI game studio

An entry for the Concordium Trusted Agents Hackathon. The plan: BEARPROOF's build agent and its
replay-verifier agent are registered in the Concordium Agent Registry with Verified badges; the
project's existing Solana prize-wallet key is bound to the agent with CIS-8; replay verification is
sold to other agents over x402 in a PLT with sponsored fees; every build, verdict and prize leaves a
receipt anchored on Concordium; and prizes are released only to players who pass a zero-knowledge
age proof. Concordium testnet.

## Status

22 Nov 2026: scaffold only. Nothing is deployed, no contract address exists yet, and no number on
this page is a result. This section is updated as each part ships.

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

## Planned layout

- `agent-card/`: the Agent Cards and the registration flow
- `x402/`: the facilitator and the paid verdict endpoint
- `zk/`: the age-proof gate
- `receipts/`: anchoring receipts in the registry

## Run the checks

```bash
npm test
node scripts/secret-scan.mjs
```

A [CrowLab](https://crowlab.ai) project. MIT licensed.
