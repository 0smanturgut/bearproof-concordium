# Agent Registry endpoints: what the live services did

Read-only and transaction-building calls only. Nothing was registered, signed or submitted. All times UTC,
all on **22 Nov 2026** unless noted. Third-party agents named below (testnet tokens 1380, 1390, 1391) were
used only as read-only examples. `npm run test:live` repeats the key checks.

## Endpoints

| What                    | URL                                                         | Auth / CORS                                        |
| ----------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| MCP (JSON-RPC 2.0)      | `POST https://agent-registry-mcp.concordium.com/mcp`        | none; `access-control-allow-origin: *`             |
| REST twins              | `GET https://agent-registry-mcp.concordium.com/v1/...`      | none; CORS open; "rate-limited per IP" (OpenAPI)   |
| OpenAPI                 | `https://agent-registry-mcp.concordium.com/openapi.json`    | OpenAPI 3.0.3, "Concordium Agent Registry — REST 1.0.0" |
| Health                  | `GET /healthz`                                              | `{"ok":true,"version":"0.1.0"}`                    |
| Indexer                 | `https://agent-registry-indexer.concordium.com/`            | none; v0.1.0                                       |
| Testnet node (gRPC-web) | `https://grpc.testnet.concordium.com:20000`                 | reported by `network_status`                       |
| Signing UI used in the steps | `https://sctools.mainnet.concordium.software/` (Concordium's Smart Contract Tools; has a mainnet/testnet/stagenet selector) | wallet connection |

## MCP

- 08:59 `tools/list`: 41 tools, plain `application/json` answer to a bare `tools/call` without an
  `initialize` handshake.
- **Trap: `network` defaults to mainnet.** Every builder's schema lists `network` as required with
  `"default": "mainnet"`, and a call without it is answered for mainnet: 09:09 `build_register` without
  `network` returned `"network": "mainnet"` and contract `<10082,0>`. Our clients always send `network`
  and reject any answer whose `network`, contract or entrypoint differs (`src/clients.js`).
- 08:59 `contract_info{network:"testnet"}`: CIS-8004 `<12802,0>` (module
  `0e57473715d1c2a364fa626b8783688db32b7fac9d0e2fc97043da91e1a7d3eb`, admin
  `3whdieGHx43KKRwQYbC5pAUdmWZ61B7yreNRU9i36MtdCvajR8`), CIS-8 `<12801,0>` (module
  `3236c12fade1b559935906df2e0e43a372234eac5d40599d6e6cb12cdd6b9afd`), standards CIS-0, CIS-2, CIS-8004,
  `explorer_base: https://testnet.ccdscan.io`. Mainnet still `<10082,0>` / `<10081,0>`.
- 08:59 `network_status{testnet}`: `node_url https://grpc.testnet.concordium.com:20000`, height 51,139,684
  (51,147,946 at 13:34).
- Result shape: `{result: {content: [{type: "text", text: "<JSON>"}], isError: false}}`; the JSON is in
  `text`.
- 09:00 `build_agent_card{network:"testnet", owner_account, token_id:null, ...}` returned
  `agent_card_json` (2-space JSON, no trailing newline), `metadata_hash_hex` (= SHA-256 of that exact
  string), `token_address: null`, and a note to re-run after mint. Its card differs from the documented
  example: it has `url` and `authentication` and no `type`, `services`, `x402Support`, `active` or
  `registrations`. Its badge block adds `agentWallet` and uses the `verify` text
  "Resolve tokenAddress via CIS-8004 agent_of; confirm owner + status=Active + card SHA-256 == metadata_hash."
  (the docs page words it slightly differently). We follow the documented card fields and copy the
  service's badge block exactly (`test/card.test.mjs` compares them).
- 09:09 `build_register{network:"testnet", sender, agent_uri, metadata_hash_hex}` returned
  `{network, contract_address {12802,0}, receive_name "CIS-8004.register", parameter_json,
  parameter_hex, suggested_energy 30000, sender}`. `parameter_hex` equals our local encoding
  (`src/params.js`): `Option<String>` (u32 LE length), `Option<[u8;32]>`, `external_reference` None,
  empty `initial_metadata`.
- 13:31 `build_cis8_canonical_bytes{network:"testnet", ..., proof_scheme:"solana-ed25519"}` returned
  `{byte_length: 249, bytes_hex, contract_address {12801,0}, genesis_hash, prefix_utf8 "CIS-8/v1/canonical",
  next_step}`. `bytes_hex` equals our local encoder (`src/cis8.js`) for the 1.0 prize wallet key.
- 13:32 `build_cis8_register` (dummy all-zero signature, built only) returned receive name
  `CIS-8.registerExternalKey` on `<12801,0>`; the parameter carries the key, the proof and empty metadata.
  The sender account is not in the parameter: the contract rebuilds the canonical message from the
  transaction's sender, so the Solana signature must be made for the account that sends this transaction.
- 13:32 `build_set_external_reference` returned `CIS-8004.setExternalReference` with
  `external_reference: Some({contract_address {12801,0}, kind: Cis8 {namespace, key_type, public_key}})`.
- 13:32 `owner_of_key` for the prize wallet key on testnet: `null` (no binding exists).
- 13:32 `agent_of{testnet, 1391}`: `{token_address, token_id, owner_account, agent_uri, metadata_hash_hex,
  agent_wallet, status, registered_at}`.

## REST

- `GET /v1/check-badge/{badge}` (09:01, badge `JyP9VyutM5xqvktMPE7Zf`, token 1391, card on
  raw.githubusercontent.com): HTTP 200,
  `{token_id, token_address, agent_uri, http_status, card_sha256, on_chain {owner_account, status,
  agent_uri, metadata_hash_hex}, checks {...}, badge_valid, issues [], network: "testnet", expected {chain,
  contracts}}`. The 15 checks: `on_chain_agent_found, status_active, has_agent_uri, card_fetched,
  hash_matches_on_chain, badge_present, badge_embedding ("extension"), badge_well_formed,
  token_address_matches, owner_matches, contracts_match, verify_present, extension_conformant,
  verification_present, verify_url_matches`. All true, `badge_valid: true`.
- Token 1380 (`JyP9Vmsb6oUdoPGmDXFK4`) returned `badge_valid: true` at 09:09; the earlier research note saw
  it `false` on 21 Nov ("card carries no Concordium badge"), so its owner re-anchored in between.
- **Trap: `check-badge/{account}` defaults to mainnet.** 09:02, the owner account of token 1391 without
  `?network=`: `"network": "mainnet", "agent_count": 0`. With `?network=testnet`: 1 agent, 1 valid. (A
  badge id resolves its own network.) In this account form, `expected.owner_account_format` and
  `expected.contracts` print the full 64-hex genesis hash, unlike the 32-hex CAIP form the badge uses; the
  per-agent checks still pass.
- A token that does not exist (999999): HTTP 200 with `checks.on_chain_agent_found: false`,
  `badge_valid: false` and an issue reading "on-chain lookup failed: ... transport error" rather than
  "not found". `GET /v1/get-badge-JSON/` for it: HTTP 404 `{"error":"not_found", ...}`.
- A malformed id: HTTP 400 with `"error": "bad_request"` and a message saying the id "is neither a CIS-8004
  badge token address nor a Concordium account address".
- `GET /v1/get-badge-JSON/{badge}` (09:01): `{network, token_address, token_id, status, owner_account,
  agent_wallet, agent_uri, extension {uri, description, required, params}, registrations_entry {agentId,
  agentRegistry}, next_steps [5], docs}`. `extension` equals `composeBadgeExtension()` byte for byte.
- `GET /v1/verify-agent-card/{badge}` (09:01): `{network, token_id, on_chain_uri, on_chain_hash_hex,
  fetched {http_status, byte_length, sha256_hex, body_preview}, match: true}`; with `?fetch=false`,
  `match: null` and no `fetched`.
- `GET /v1/build-set-agent-uri/{badge}?metadata_hash_hex=...` (09:02, unsigned, no sender):
  `{network, contract_address, receive_name "CIS-8004.setAgentURI", parameter_json, parameter_hex,
  suggested_energy 30000, notes}`. `parameter_json.token_id` is the TokenIdU64 hex `"6f05000000000000"`;
  `parameter_hex` = `08` + 8 LE bytes, then the two options. Equals `encodeSetAgentUri()`.
- Passing `?network=testnet` on badge-keyed routes is accepted (13:32), so our client always sends it.

## Indexer

- 09:00 `/status`: `default_network: "devnet"`; testnet 1,411 agents and 7,103 events, lag 0; mainnet
  5,305 agents. (21 Nov: testnet 1,391.)
- **Trap: the indexer defaults to devnet.** `/agents/1391` without `?network=` is a 404 ("agent not
  found"); `/agents?limit=2` lists devnet agents.
- `/agents?network=testnet&owner=<account>`: `{network, count, total, agents[]}`, each
  `{network, token_id, owner_account, agent_uri, metadata_hash_hex, agent_wallet, status, registered_at,
  last_event_block}`.
- `/agents/<id>?network=testnet`: `{network, agent {...}, metadata {}}`.
- `/agents/<id>/history?network=testnet`: `{network, count, events[]}` with `block_height, block_hash,
  tx_hash, event_index, event_tag, event_name` (Mint, Registered, AgentWalletSet, ...), `token_id`,
  `payload {raw_hex, decoded: false}`, `timestamp`.
- `/cis8/keys?network=testnet`: one row with empty `namespace`, `key_type`, `public_key_hex` and
  `owner_account`. CIS-8 bindings are better read with MCP `owner_of_key`.
- Hosting on GitHub is common on testnet: of 911 listed testnet agents, 45 point at raw.githubusercontent.com
  and 19 at gist.githubusercontent.com.

## Signing: what the official apps do

- The testnet registry app (`https://testnet-agent-registry.concordium.com/dashboard`, from
  `networkRedirects` in its `config.js`) registers agents, revokes, transfers and links an external key
  through a browser Solana or Ethereum wallet. Its "Register Agent" form has a "Metadata URL" field and a
  hidden `metadataHashHex` that it fills with **32 random bytes** (`generateMetadataHashHex()` in
  `app.bundle.js`), so an agent registered there starts with a hash that cannot match its card. It has no
  `setAgentURI` action. It submits through `registry-sponsor-service.concordium.com` when the wallet
  supports sponsored transactions. We therefore do not use it for registration.
- Concordium's Smart Contract Tools page (`sctools.mainnet.concordium.software`, read from its bundle on
  22 Nov) offers "Choose your network" (mainnet, testnet, stagenet), "Connect To Browser Wallet", and an
  "Update Smart Contract Instance" form (Smart Contract Index, Smart Contract Name, Entry Point Name, Max
  Execution Energy, "Derive From Smart Contract Index", "Is Payable", "Has Input Parameter", input
  parameter type and value). It serialises the JSON parameter with the module's embedded schema and sends
  it to the wallet. The CIS-8004 module has an embedded schema (CCDScan `moduleReferenceEvent.displaySchema`
  shows `setAgentURI {token_id, agent_uri: Option<String>, metadata_hash: Option<[u8;32]>}`), and the
  MCP `parameter_json` is in that schema's JSON form. **Not yet tried end to end with a wallet.**
- CCDScan testnet GraphQL: `https://api-ccdscan-fungy.testnet.concordium.com/api/graphql` (POST, open).

## Not confirmed

- Signing through Smart Contract Tools with Concordium Wallet for Web on testnet (labels read from code;
  no wallet was connected in this session).
- Whether the hosted sponsor service would also cover a `setAgentURI` sent from another dApp.
- The CIS-8 contract accepting a `solana-ed25519` proof for the namespace
  `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (the registry app's chain list uses it for Solana; the spec's
  example says `solana:mainnet`). Both are just strings in the signed message; the one we sign must be
  the one we register, which our scripts guarantee.
- Rate limits: none hit.
