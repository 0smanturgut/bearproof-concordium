# AI usage

- Tools: Claude Code sessions that Osman (the operator) starts, directs and reviews. In BEARPROOF 1.0
  a scheduled build agent (Claude, headless, in GitHub Actions) also wrote Builds #3 to #31; that agent
  is not running now and has written nothing in this repository.
- AI-written: everything in this repository so far, by Claude Code sessions the operator started:
  - 22 Nov 2026: the scaffold.
  - 22 Nov 2026: the two Agent Cards, the `src/` library, `scripts/card.mjs`, `scripts/registry.mjs`,
    `scripts/cis8-sign-solana.mjs`, the tests and `docs/` (agent-cards, register, api-notes,
    planned-services). That session made only read-only and transaction-building calls to the public
    Concordium testnet services; it signed nothing, submitted nothing, created no account and handled no
    key (the signer was tried with a throwaway key made and deleted in a temp folder).
- Human-written: nothing yet. The operator reviews every change.
- What the human does: architecture, specs and prompts, chain-integration design, guardrails,
  contract review, test plans, deployment, key handling, user outreach, video narration.
- How to verify: every commit carries a `Build-Mode` trailer (`bootstrap` = a Claude Code session
  the operator started, `human` = written by the operator, `agent` = the scheduled build agent) and a
  `Co-Authored-By` line when an AI wrote it. CI fails on a commit without the trailer.
