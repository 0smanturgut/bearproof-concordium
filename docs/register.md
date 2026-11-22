# Registering the two agents on Concordium testnet

Step by step, in order. **Operator** steps are Osman's (wallet, identity, signing, keys). **AI session**
steps are run by a Claude Code session in this repository; they only read the chain and build unsigned
payloads. Nothing on this page asks anyone to paste a private key, a seed phrase or a key file anywhere.
Account addresses, badges, token ids, transaction hashes and signatures are public and safe to share.

Background: [agent-cards.md](agent-cards.md) (cards, hash rule, hosting),
[api-notes.md](api-notes.md) (what the services did when tested).

Status, 22 Nov 2026: nothing below has been done yet.

## Part A. Wallet, identity, accounts (operator, about 20 minutes)

1. **Install Concordium Wallet for Web** in Chrome or Brave from the Chrome Web Store
   (https://chromewebstore.google.com/detail/concordium-wallet/mnnkpffndmickbiakofclnpoiajlegmg, the link
   on agent-registry.concordium.com). Create a wallet and write the seed phrase on paper. Never type it
   into any website, chat or file.
2. **Switch to testnet.** Click the menu icon, then **Network**, then **Testnet**. The wallet turns green.
   Identities and accounts are separate on mainnet and testnet.
3. **Create a testnet identity.** Menu, then **ID Cards**, then **Request Identity**. Choose
   **Concordium testnet IP**. It asks for no documents; fill in made-up attributes. Use a date of birth
   more than 18 years ago and any country of residence (the later age-proof demo needs them). This is a
   test identity with invented data, and the project says so publicly.
4. **Create four accounts** from that identity: menu, then **Accounts**, then **Create account**, choose
   the identity, **Create account**. Repeat until you have four, and write down which address is which:
   1. build agent
   2. verifier
   3. sponsor (needed later for x402 and sponsored prizes)
   4. player (needed later for the age-proof demo)
5. **Request test CCD for each account, before anything is sent to it.** Select the account, click
   **Activity**, then **Request CCD**. 20,000 CCD arrive within seconds. This works once per account and
   only while the account has never received a transfer, so do it for all four accounts before moving
   any CCD between them.
6. **Send the AI session the four addresses**, labelled (for example "build agent: 3abc..."). Nothing else.

## Part B. The first cards (AI session, then the push)

1. Compose the pre-mint cards (badge with `tokenAddress: null`):
   ```bash
   node scripts/card.mjs compose --release cards-v1 --agent build-agent     --owner <build agent account>
   node scripts/card.mjs compose --release cards-v1 --agent replay-verifier --owner <verifier account>
   node scripts/card.mjs validate
   ```
2. Commit `agent-card/published/cards-v1/`, tag that commit `cards-v1`, and push the commit and the tag.
   Never move or delete a `cards-v*` tag afterwards.
3. Confirm GitHub serves the exact bytes:
   ```bash
   node scripts/card.mjs check-hosted --release cards-v1 --agent build-agent
   node scripts/card.mjs check-hosted --release cards-v1 --agent replay-verifier
   ```
   Both must print `match`.

## Part C. Register each agent (AI session builds, operator signs)

1. AI session, build agent first:
   ```bash
   node scripts/registry.mjs build-register --release cards-v1 --agent build-agent --sender <build agent account>
   ```
   It checks the URL serves the card's bytes, builds the payload on the registry service, compares it with
   a local encoding, and prints a signing sheet. The parameter is saved to
   `out/register-build-agent.parameter.json` (one line).
2. Operator: in the browser with the wallet, select the **build agent** account in the wallet, then open
   https://sctools.mainnet.concordium.software/ (Concordium's Smart Contract Tools; it serves all
   networks).
   1. **Choose your network**: `testnet`.
   2. Click **Connect To Browser Wallet** and approve the connection in the wallet. "Connected account"
      must show the build agent address.
   3. In **Update Smart Contract Instance**, fill in exactly what the sheet says:
      - Smart Contract Index: `12802`
      - Smart Contract Name: `CIS-8004`
      - Entry Point Name: `register`
      - Max Execution Energy: `30000`
      - tick **Derive From Smart Contract Index**; leave **Is Payable** unticked; tick
        **Has Input Parameter**
      - Select input parameter type: `object`
      - input parameter: paste the one line from the `.parameter.json` file
   4. Click **Update Smart Contract**. The wallet opens: check the sender is the build agent account and
      the contract is 12802, then approve. The fee is a fraction of a test CCD.
   5. Wait until the page shows the outcome. Copy the transaction hash.
3. AI session: find the new token id and badge:
   ```bash
   node scripts/registry.mjs owner <build agent account>
   node scripts/registry.mjs agent <token id>
   ```
4. Repeat 1 to 3 for `--agent replay-verifier` with the **verifier** account (switch the account in the
   wallet and reconnect on the tools page).

If the tools page refuses the parameter or the wallet shows an error, stop and send the AI session a
screenshot of the message. Do not retry with edited values.

## Part D. Add the badge (cards-v2, one setAgentURI each)

1. AI session: compose the cards with the token ids. This pastes the badge block from the registry
   (`/v1/get-badge-JSON`) after checking it against the documented form, and adds the ERC-8004
   `registrations` entry:
   ```bash
   node scripts/card.mjs compose --release cards-v2 --agent build-agent     --owner <build agent account> --token-id <n>
   node scripts/card.mjs compose --release cards-v2 --agent replay-verifier --owner <verifier account>    --token-id <m>
   ```
   Commit, tag `cards-v2`, push commit and tag, run `check-hosted` for both (as in Part B).
2. AI session: build the setAgentURI payloads (new URL and new hash in one transaction, so the card and
   the chain never disagree):
   ```bash
   node scripts/registry.mjs build-set-uri --release cards-v2 --agent build-agent     --sender <build agent account>
   node scripts/registry.mjs build-set-uri --release cards-v2 --agent replay-verifier --sender <verifier account>
   ```
3. Operator: sign each one on the tools page as in Part C, with **Entry Point Name** `setAgentURI` and
   the matching account selected.
4. Check (anyone can):
   ```bash
   node scripts/registry.mjs check-badge <build agent badge>
   node scripts/registry.mjs check-badge <verifier badge>
   node scripts/registry.mjs check-badge <build agent account>
   ```
   Each badge must print `VALID` with `extension_conformant` and `verification_present` true and no
   issues. In a browser: `https://agent-registry-mcp.concordium.com/v1/check-badge/<badge>`.

## Part E. Link the 1.0 Solana prize wallet to the verifier (CIS-8)

This proves that whoever controls the 1.0 prize wallet `GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5`
also controls the verifier account, and then points the verifier agent at that key.

1. **Operator: check that you still hold this key.** In 1.0 it was created with
   `node scripts/new-wallet.mjs | npx wrangler secret put PRIZE_WALLET_KEY`, which put it straight into
   the Worker secret and never wrote it to disk, and Cloudflare never shows a secret again. If you have
   no other copy (a password manager entry, a wallet app you imported it into, a backup file), stop here
   and tell the AI session; do not try to recover it from Cloudflare. The choices then are a one-off
   signing step inside the game's Worker (a change to the game repository) or leaving this link out.
2. AI session: print the message the key must sign (the registry service and our local encoder must
   agree, or it stops):
   ```bash
   node scripts/registry.mjs cis8-message --account <verifier account> --solana GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5
   ```
   What gets signed: 249 bytes made of `CIS-8/v1/canonical`, the verifier account, the CIS-8 contract
   `<12801,0>`, the testnet genesis hash, the Solana namespace, the public key and `solana-ed25519`. It
   can only bind this key to this account in this testnet contract. It is not a Solana transaction and
   cannot move funds.
3. Operator, on your own computer, in this repository (no network needed):
   - from a key file (a solana-keygen JSON file, or a text file holding the base58 secret):
     ```bash
     node scripts/cis8-sign-solana.mjs --account <verifier account> --solana GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5 --keyfile <path to the key file>
     ```
   - or piped from a password-manager command line, so the key is never typed or shown:
     ```bash
     <command that prints the secret> | node scripts/cis8-sign-solana.mjs --account <verifier account> --solana GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5 --stdin
     ```
   It refuses unless the key is that address, and prints one line of 128 hex characters: the signature.
   Send only that line. Never send the key or the file.
4. AI session: check the signature and build the CIS-8 registration:
   ```bash
   node scripts/registry.mjs build-cis8-register --account <verifier account> --solana GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5 --signature <128 hex>
   ```
5. Operator: sign it on the tools page with the **verifier** account: Smart Contract Index `12801`,
   Smart Contract Name `CIS-8`, Entry Point Name `registerExternalKey`, the rest as in Part C. It must be
   the verifier account: the contract rebuilds the signed message from the sending account.
6. AI session, then operator: point the verifier agent at the key:
   ```bash
   node scripts/registry.mjs build-set-external-reference --badge <verifier badge> --sender <verifier account> --solana GD9HPVpLqDxYfgf9ZNQDN3WwCfZips7tVCHAhMcchRo5
   ```
   Sign on the tools page: index `12802`, name `CIS-8004`, entry point `setExternalReference`.
7. Check: `node scripts/registry.mjs check-badge <verifier badge>` still prints `VALID` (the card did not
   change). If `badge-json <verifier badge>` now shows the external key in the block, compose a
   `cards-v3` for the verifier and pin it as in Part D so the card shows it too.

## What to send back to the AI session, in order

| After        | Send                                                         |
| ------------ | ------------------------------------------------------------ |
| Part A       | the four account addresses, labelled                         |
| each signing | the transaction hash, or a screenshot of any error          |
| Part E.1     | "I have the key" or "I don't"                               |
| Part E.3     | the 128-character signature line                             |
