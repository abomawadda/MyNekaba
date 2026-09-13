# Phase 5 Trusted Backend Foundation

This phase adds dry-run Firebase Auth migration tooling only. It does not migrate users,
create Firebase Auth accounts, update Firestore documents, change roles, change
permissions, or touch financial data.

## Trusted Runtime Choice

The current project has `firebase.json` for Firestore and Storage rules, but no
existing `functions/` backend or Express server. Phase 5 therefore uses a trusted
Node.js Admin CLI for inventory and planning. Future runtime privileged actions can
be added as Firebase Cloud Functions once Firebase Auth becomes the primary identity
proof.

## Admin SDK Isolation

Admin SDK code lives under `tools/migration/`, outside `src/` and outside the Vite
frontend bundle. Do not import `firebase-admin` from React code.

## Credentials

Use one of the standard trusted credential options:

- Application Default Credentials from an authenticated Firebase/Google Cloud CLI.
- `GOOGLE_APPLICATION_CREDENTIALS` pointing to a local service account JSON file.
- Cloud runtime credentials if this logic is later moved into Cloud Functions.

Never commit service account JSON, private keys, or Admin SDK secrets. Do not expose
Admin credentials through `VITE_*` variables.

## Dry Run

Install dependencies first if `firebase-admin` is not present:

```bash
npm install
```

Run inventory with an explicit project id:

```bash
npm run migration:identity:dry-run -- --project=<firebase-project-id>
```

Optional Auth skip for Firestore-only local validation:

```bash
npm run migration:identity:dry-run -- --project=<firebase-project-id> --skip-auth
```

The tool writes local JSON reports under `migration-output/<execution-id>/`:

- `migration-summary.json`
- `migration-conflicts.json`
- `migration-plan.json`
- `migration-log.json`

The reports do not include passwords, password hashes, salts, or session tokens.

## Apply Mode

`--apply` is intentionally refused in Phase 5. Write migration belongs to a later
phase after review, backups, and production approval.

## Migration States

The dry-run inventory supports:

- `LINKED_VALID`
- `LEGACY_UNLINKED`
- `UID_MISSING_IN_AUTH`
- `UID_COLLISION`
- `EMAIL_COLLISION`
- `FIREBASE_ONLY`
- `INVALID_ACCOUNT`
- `NEEDS_MANUAL_REVIEW`

## Collision Detection

The tool reports duplicate Firebase UIDs, duplicate normalized emails, duplicate
usernames, missing Auth users for stored UIDs, Firebase-only identities, email
mismatches, disabled Auth users mapped to active local accounts, and active Auth
users mapped to disabled local accounts.

## Password Migration Assessment

The legacy password hash is `SHA-256` over:

```text
<salt>::<password>
```

The salt is stored per account as `passwordSalt`. Phase 5 does not attempt Firebase
password import. Unless Firebase bulk import can be proven to match the exact hash,
salt placement, encoding, and parameters, use trusted JIT migration instead.

## Future JIT Design

1. User submits legacy credentials over HTTPS.
2. A trusted backend verifies the legacy account.
3. The backend checks Firebase Auth and local `firebaseUid`.
4. If safe and collision-free, the backend creates or links the Firebase identity.
5. The backend writes `firebaseUid` and trusted audit metadata.
6. The frontend continues with Firebase sign-in.

Passwords must never be logged, persisted in plaintext, stored in Firestore, or
returned in API responses.

## Trusted Audit Direction

Future trusted audit writes should use server-derived metadata:

- verified actor UID from Firebase Auth context
- server timestamp
- action
- target id
- minimal metadata

Do not trust `actorId` or `actorRole` from request bodies without server-side
verification.

## Backup Plan Before Write Migration

Before any future apply mode:

- Export `user_accounts`.
- Export current `accountId -> firebaseUid` mapping.
- Export Firebase Auth user metadata needed for reconciliation.
- Save a dry-run migration inventory and conflict report.

Do not run destructive import/export as part of Phase 5.

## Rollback And Partial Failure Strategy

Firebase Auth and Firestore are not a single transaction. Future write tooling must
log partial failures and be idempotent. If an Auth user is created but Firestore
linking fails, record the incomplete state, retry safely, and only clean up the new
Auth identity when it is known to be migration-created and safe to remove.

## Tests

Run pure migration logic tests:

```bash
npm run test:migration
```
