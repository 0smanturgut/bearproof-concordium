# AI usage

- Tools: Claude Code sessions that Osman (the operator) starts, directs and reviews. In BEARPROOF 1.0
  a scheduled build agent (Claude, headless, in GitHub Actions) also wrote Builds #3 to #31; that agent
  is not running now and has written nothing in this repository.
- AI-written: everything in this repository so far (a scaffold written by a Claude Code session on 22 Nov 2026).
- Human-written: nothing yet. The operator reviews every change.
- What the human does: architecture, specs and prompts, chain-integration design, guardrails,
  contract review, test plans, deployment, key handling, user outreach, video narration.
- How to verify: every commit carries a `Build-Mode` trailer (`bootstrap` = a Claude Code session
  the operator started, `human` = written by the operator, `agent` = the scheduled build agent) and a
  `Co-Authored-By` line when an AI wrote it. CI fails on a commit without the trailer.
