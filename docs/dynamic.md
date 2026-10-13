# How Likeness uses Dynamic

**Bounty:** Best Use of Dynamic. **Video:** [youtu.be/-p0lISoYOG4](https://youtu.be/-p0lISoYOG4) · [Back to the README](../README.md)

## Status on likeness.site (14 October 2026)

- **Live and used:** every person signs in with email through Dynamic and gets a Dynamic embedded wallet
  on Monad testnet; creators register on chain from it (verified 13 Oct 2026). Brands sign in and sign
  their profile the same way; no licence has yet been requested or funded from a Dynamic wallet on chain.
- **Live, configured, not yet exercised:** the render agent is a Dynamic server wallet, registered on
  the escrow; delegated access (the payRender-only policy) is set up, with its webhook enforcing
  signatures. No brand has delegated yet, so no one-click delegated render has happened on chain.
- **Not used:** Fireblocks Flow.

`/api/status` on likeness.site reports `dynamic`, `dynamic-delegation` and `dynamic-agent` as configured.

## What each piece does, and its state

| Piece | Code | State |
|---|---|---|
| Email OTP sign-in and WaaS EVM embedded wallet on Monad testnet | [`OnboardFlow.tsx`](../web/components/onboard/OnboardFlow.tsx), [`WalletProvider.tsx`](../web/components/wallet/WalletProvider.tsx) | Live (verified 13 Oct 2026) |
| Monad testnet as a custom network (`transformers.networksData`) | [`providers.tsx`](../web/app/providers.tsx) | Live (verified 13 Oct 2026) |
| One-time MON top-up to new embedded wallets | [`drip.ts`](../web/lib/server/drip.ts) | Live (configured) |
| Render agent as a Dynamic server wallet (`DynamicEvmWalletClient.createWalletAccount`, `signTypedData`) | [`agent.ts`](../web/lib/server/agent.ts), `pnpm agent:dynamic` | Live (configured, not yet exercised in a paid render). Wallet `0xc391F49938607617E5eBC761B8495481849dFE2f`, registered as a render agent |
| Brand delegates its embedded wallet to the render service: `delegateWaasKeyShares` with an `initialSignerRules` allow rule | [`Delegation.tsx`](../web/components/dashboard/Delegation.tsx) | Live (configured, not yet exercised) |
| Webhook `wallet.delegation.created` / `.revoked`, HMAC-SHA256 checked (`x-dynamic-signature-256`); the share is stored still encrypted to our RSA key | [`api/dynamic/webhook`](../web/app/api/dynamic/webhook/route.ts) | Live (configured, not yet exercised). Rejects unsigned requests with 401 |
| Server-side delegated signing (`decryptDelegatedWebhookData` per signature, `delegatedSignTransaction`, then `sendRawTransaction`) | [`delegation.ts`](../web/lib/server/delegation.ts) | Live (configured, not yet exercised) |
| Revocation: `revokeWaasDelegation` in the browser, and the grant closed on our side | [`Delegation.tsx`](../web/components/dashboard/Delegation.tsx), [`api/delegation`](../web/app/api/delegation/route.ts) | Live (configured, not yet exercised) |
| Fireblocks Flow | n/a | Not used |

Without a delegation, a brand confirms each `payRender` in its own embedded wallet: the server signs the
render authorisation and holds the file until the payment is on chain.

## Verified live

On Monad testnet:

- **Sign-in creates an embedded wallet that transacts:** the Dynamic embedded wallet
  `0x61af3406429be02f1e89c0af8c0dcea630a55db5`, signed in on likeness.site, registered as a creator,
  13 Oct 2026:
  [`0x1c4560…a0d4bc`](https://testnet.monadvision.com/tx/0x1c456046da42c9351c0102ff3cd4f6dd97cf6e421bb278307b8246eb01a0d4bc).
- **The render agent is a Dynamic server wallet:** `0xc391…FE2f` registered with
  `LicenseEscrow.setRenderAgent`, 13 Oct 2026:
  [`0xd6b951…e1d820`](https://testnet.monadvision.com/tx/0xd6b951051187f0f869b0beae9c50e2bb6792f4396046559911dfcd9c08e1d820).
  A Render attestation it signed (checked locally) recovers to its address.
- **The delegation webhook is live:** `https://www.likeness.site/api/dynamic/webhook` rejects an
  unsigned request with 401.

The licence flow itself is on chain from the team's test run of 10 Oct 2026, with seeded **test
wallets (local keys, not Dynamic)**:

- a licence approved by the creator's signature:
  [`0x7ad0fa…c61ea2`](https://testnet.monadvision.com/tx/0x7ad0fa91b12eb14abc2f7c1f4ae0a7090745d4cc6eedf12128d1ec62dfc61ea2);
- the brand's USDC escrow deposit:
  [`0xe3e167…5df7f1`](https://testnet.monadvision.com/tx/0xe3e1670fc2f6eb052e916becb95de5ba5dacfa044f6ae4db0b929ccd145df7f1);
- a `payRender` sent from the brand's own wallet, signed by the earlier local render agent:
  [`0x5ac091…382332`](https://testnet.monadvision.com/tx/0x5ac091d910f03a9b073c13a1074e9c1ca3d83b26b8d37578df67e64311382332).

Not yet on chain: a delegated one-click `payRender`, and a render refused after revocation.

## The policy, layer by layer

The brand chooses a **total cap** in USDC and signs a statement naming the escrow, `payRender`, chain
10143 and the cap. Then:

1. **Dynamic signer rule** (installed with `delegateWaasKeyShares`): `chainIds: [10143]` and an
   `addresses` allowlist. The allowlist covers every address a `payRender` touches: the four protocol
   contracts, USDC and USDC's proxy implementation, because Dynamic evaluates every touched address.
   These are the fields Dynamic's signer layer enforces. The SDK's own types say `functionName`,
   `contractAbi` and `valueLimit.totalLimit` are not evaluated on signer layers
   (`@dynamic-labs-sdk/client` 1.38.0, `policies/policies.types.d.ts`). We don't set them or imply
   they protect anything.
2. **Our guard** ([`checkPolicy`](../web/lib/server/delegation.ts)), before any delegated signature,
   refuses a transaction unless all of these hold:
   - the destination is our escrow;
   - the chain is 10143;
   - the value is 0;
   - the calldata decodes as `payRender`;
   - the licence belongs to this brand;
   - the price fits under the remaining cap.

   Spends are serialised per brand, and the cap is charged only once the transaction succeeds. The
   fork test checks each refusal.
3. **The contract:** `payRender` requires the licensee as sender and a render agent's signature over
   the exact file. It pays at most the licence price, only to the creator, the treasury and refunds.

## The honest limits

- **Delegated access is sandbox-only without a Dynamic Enterprise plan**
  ([delegated access](https://www.dynamic.xyz/docs/embedded-wallets/mpc/delegated-access/overview.md)).
  likeness.site runs on Dynamic's sandbox environment.
- **Wallet and signer policy layers are in early access** at Dynamic. The signer rule is installed with
  the delegation, but we rely on it only for chain ID and addresses (see the layers above).
- **Monad is not in Dynamic's chain list**; it is configured as a custom EVM network. Embedded wallets
  sign and send on it (verified above). Whether Dynamic's signer rule accepts chain 10143 is still
  untested, because no brand has delegated yet. Layers 2 and 3 hold either way.
- **The real enforcement is on chain.** `LicenseEscrow.payRender` requires the licensee as `msg.sender`
  *and* a registered render agent's EIP-712 signature. It reverts on a revoked, expired or used-up
  licence, or on a short balance.
- **A delegated share only attaches to a grant the brand created first** (signed cap on the dashboard),
  so Dynamic's "prompt users on sign in" is off; a share sent without a grant is discarded.
- **Fireblocks Flow** needs Dynamic's team to unlock it, so it is not used.

## APIs used (verified against the installed packages)

- `@dynamic-labs-sdk/client` 1.38.0: `createDynamicClient` (`environmentId`, `transformers.networksData`).
  From `@dynamic-labs-sdk/client/waas`: `createWaasWalletAccounts`, `delegateWaasKeyShares`
  (`walletAccount`, `initialSignerRules`), `buildAllowPolicyRule`, `revokeWaasDelegation`.
- `@dynamic-labs-sdk/evm` 1.38.0: `addWaasEvmExtension` (`/waas`) and
  `createWalletClientForWalletAccount` (`/viem`).
- `@dynamic-labs-sdk/react-hooks` 1.38.0: `DynamicProvider`, `useSendEmailOTP`, `useVerifyOTP`, `useUser`,
  `useGetWalletAccounts`, `useCreateWaasWalletAccounts`, `useDelegateWaasKeyShares`, `useLogout`.
- `@dynamic-labs-wallet/node-evm` 1.1.28: `createDelegatedEvmWalletClient`, `delegatedSignTransaction`,
  `DynamicEvmWalletClient` (`authenticateApiToken`, `createWalletAccount`, `signTypedData`).
- `@dynamic-labs-wallet/node` 1.1.28: `decryptDelegatedWebhookData` (RSA-OAEP SHA-256 + AES-256-GCM),
  `ThresholdSignatureScheme`.

## Running it locally

The live site has all of these set. For a local copy, put them in `web/.env.local` (secrets in
`../.secrets/`):

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_DYNAMIC_ENV_ID` | Dashboard → Developers → SDK & API keys (sandbox environment); add `http://localhost:3000` to allowed origins |
| `DYNAMIC_API_KEY` | Dashboard → Developers → API tokens (environment API token) |
| `DYNAMIC_AGENT_FILE` or `DYNAMIC_AGENT_JSON` | Written by `pnpm agent:dynamic`, which creates the server wallet and registers it on the escrow |
| `DYNAMIC_DELEGATION_PRIVATE_KEY_FILE` or `_PEM` | The RSA private key (PEM) whose public half is pasted into Embedded Wallets → Delegated Access |
| `DYNAMIC_WEBHOOK_SECRET` | The webhook Dynamic creates for Delegated Access; its endpoint must be public HTTPS (`https://www.likeness.site/api/dynamic/webhook` on the live site, a tunnel such as ngrok locally) |

Dashboard settings used on the live site: Delegated Access on, "Prompt users on sign in" off, "Require
delegation" off. Locally, seeded test brands can use **dev delegation** instead (`DEV_DELEGATION=1`, a
local key file, labelled "DEV delegation (local key, not Dynamic)"); it goes through the same policy
guard. It is off on the live site (`DEV_DELEGATION` is not set there).
