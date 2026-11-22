# Planned services (not built, not published, not in any card)

Nothing on this page exists yet. None of it appears in an Agent Card, because a card may only list an
endpoint that answers today. When a service ships, the card changes in a new release (`cards-vN`) and is
re-pinned with `setAgentURI`; this page then moves the item to the README's status.

| Planned                                                                                              | For                   | Card change when it ships                                                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POST /verify-replay`: replay verification sold per call over x402, paid in a test PLT, fees sponsored | Replay Verifier       | a `services` entry for the endpoint, `x402Support: true`, `active: true`, a skill entry pointing at it        |
| An MCP or A2A interface for that endpoint                                                            | Replay Verifier       | `supportedInterfaces` / an `MCP` or `A2A` service entry                                                      |
| A signed, anchored receipt for each verdict, build and prize                                         | both                  | none in the card; receipts are anchored on chain (`setMetadata` or memos)                                    |
| Daily prizes released only after a ZK age proof                                                      | the prize flow        | none in the card                                                                                             |
| Restarting the build agent                                                                           | Build Agent           | `active: true` only once it runs again, with the date                                                        |

Dates are not promised here; the plan for this hackathon is tracked outside the repository.
