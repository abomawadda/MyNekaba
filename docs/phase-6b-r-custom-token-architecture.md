# Phase 6B-R Custom Token Architecture

Phase 6B-R pivots the Firebase Auth migration away from email/password and toward
the real login model: username plus password.

No production migration, Firebase user creation, `firebaseUid` write, Login UI
change, AuthProvider rewrite, Firestore Rules update, or financial data change is
performed in this phase.

## Decision

Use Firebase Custom Token authentication behind a trusted backend.

Current UX remains:

```text
username + password
```

Target auth flow:

```text
LoginPage
-> trusted legacyLogin endpoint
-> backend verifies legacy username/password
-> backend resolves or creates stable Firebase UID
-> backend returns Firebase custom token
-> frontend calls signInWithCustomToken()
-> frontend resolves local user_accounts profile
-> app session/device tracking continues through auth_sessions
```

## Trusted Runtime

Use a minimal Firebase HTTPS or Callable Cloud Function. Do not use the Admin CLI
as the runtime login backend.

The function must use Firebase Admin SDK server-side only. Admin SDK, service
account credentials, and token signing logic must never enter `src/` or the Vite
bundle.

## Stable UID

Preferred UID strategy:

1. Use the local `user_accounts` document ID as Firebase UID when it is unique and
   valid for Firebase UID constraints.
2. Persist that UID in `user_accounts.firebaseUid` after successful trusted legacy
   login.
3. Later add a rules-friendly mapping document:

```text
auth_uid_map/{uid}
  accountId
  role
  status
```

The mapping is important because Firestore Rules cannot query
`user_accounts where firebaseUid == request.auth.uid`.

Do not use email, username, or role as UID.

## Backend Login Contract

Endpoint: `legacyLogin`

Input:

```json
{
  "username": "string",
  "password": "string"
}
```

Success output:

```json
{
  "customToken": "firebase-custom-token"
}
```

The backend must:

- normalize username
- look up `user_accounts`
- reject missing, blocked, pending, or disabled accounts
- verify legacy password server-side with `SHA-256(<salt>::<password>)`
- enforce rate limit and lockout policy
- resolve stable Firebase UID
- create or link Firebase identity by UID/custom auth
- write `firebaseUid` only after successful credential verification
- write trusted audit
- create a custom token

The backend must never log, store, return, or write plaintext password, password
hash, password salt, service account credentials, refresh tokens, or session
tokens.

## Client Changes For Next Phase

Add a small auth API adapter instead of rewriting `AuthProvider`:

```text
src/security/trustedAuthApi.js
```

Future client flow:

1. LoginPage keeps the current identifier/password UI.
2. AuthProvider calls `legacyLogin(identifier, password)`.
3. Client calls Firebase `signInWithCustomToken(auth, customToken)`.
4. Client fetches the local account by `firebaseUid` or returned `accountId`.
5. Existing `auth_sessions` records device/session metadata.

## auth_sessions Role

`auth_sessions` remains useful for device tracking, logout metadata, revocation,
and audit. It should stop being the primary proof of identity once Firebase Auth
custom-token login is active.

## Password Reset

Firebase email password reset is not the default fit for this architecture.
Password reset should remain a trusted legacy/account recovery flow unless the
business later requires email-based reset for selected accounts.

## Canary Criteria

Revised canary criteria:

- active account
- role `viewer`
- unique username
- usable legacy credential
- no `firebaseUid`
- no UID collision
- no identity mismatch
- not blocked

Email is not required for custom-token canary.

## Security Risks And Controls

- Credential interception: HTTPS only, no logging, short request handling path.
- Brute force: server-side attempt counters, temporary lockout, generic failure.
- Endpoint abuse: rate limiting, App Check-ready design, audit.
- UID takeover: UID resolved only from verified local account after password check.
- Replay: custom tokens are short-lived; client exchanges them with Firebase.
- Stale authorization: keep roles in `user_accounts`, not long-lived claims.
- Session fixation: create fresh app session after Firebase sign-in.
- Token leakage: never log custom tokens; return only over HTTPS.

## Current Candidate Check

Read-only production check did not find `user_accounts.username == "mahmoud.eleraky"`.
That username exists in the codebase as the legacy fallback admin username, not as
a production `user_accounts` record in the current inventory.

Before canary implementation, confirm whether the intended canary should be:

- the active viewer account currently in `user_accounts`, or
- the legacy fallback/admin login path, which should not be used as the first
  Firebase Auth canary.
