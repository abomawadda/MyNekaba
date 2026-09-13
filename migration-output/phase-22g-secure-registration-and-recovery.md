# Phase 22G - Secure Registration and Recovery

Date: 2026-09-14
Status: PASSED locally

## Scope

Implemented a server-trusted employee registration and account recovery flow after Phase 22F.1 runtime JIT acceptance.

The implementation does not modify financial modules, treasury logic, settlement logic, check lifecycle logic, or Firestore security rules.

## Implemented

- Added trusted Firebase Admin helper shared by API routes.
- Moved employee registration identity checks behind `/api/auth/verify-employee`.
- Enforced strict same-employee matching for national ID, employee code, and phone.
- Removed frontend dependence on broad employee reads for registration and recovery.
- Added duplicate prevention against existing user accounts and active registration requests.
- Added `/api/auth/register-complete` to create Firebase Auth users and pending Firestore accounts server-side.
- Added email verification dispatch after account creation through a short Firebase custom-token sign-in.
- Added `/api/auth/recovery-request` with generic responses and no password mutation.
- Added admin-only approval and rejection endpoints for pending accounts.
- Updated Security Center to approve pending accounts through the trusted backend path.
- Added focused regression tests for Phase 22G matching, masking, duplicate prevention, and password policy.

## Runtime Behavior

New registration flow:

1. Employee submits national ID, employee code, and phone.
2. Server verifies that all identifiers match one employee record.
3. Server returns only masked/minimal preview data and a short verification token.
4. Employee selects registered or new email and submits password.
5. Server creates Firebase Auth user and a `pending_approval` member account.
6. Client sends email verification, signs out, and waits for admin approval.
7. Admin approves or rejects the account from Security Center.

Recovery flow:

1. Employee submits identity proof.
2. Server validates identity and existing account state.
3. Response remains generic in all cases.
4. No password reset or sensitive account detail is exposed client-side.

## Security Notes

- Employee collection enumeration is removed from public registration and recovery screens.
- Failed identity checks are audited using hashed identifiers only.
- Registration requests use hashed verification tokens and short expiry.
- New accounts are not activated automatically.
- Approval requires a Firebase ID token with an admin account claim.
- Registration-created accounts do not store legacy password fields.

## Manual Firebase Checklist

The following remain Firebase Console / Vercel configuration responsibilities:

- Email/Password provider enabled.
- Production domain added to Firebase authorized domains.
- Email verification template reviewed for production wording.
- Server environment variables configured only as backend variables:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
  - `JIT_ALLOWED_ORIGINS`
- Optional hardening: enable App Check enforcement after live acceptance.

## Validation

- `node --test --test-reporter=spec tools/migration/*.test.js` passed: 52 tests.
- `npx.cmd eslint src api tools` passed.
- `npm.cmd run build` passed.

Build warnings observed:

- Browserslist/caniuse-lite data is stale.
- Main application chunk remains large.
- `xlsx` is imported both statically and dynamically in existing modules.

These warnings are not introduced by Phase 22G and do not block the secure registration/recovery flow.

## Production Data Impact

- No production migration was executed.
- No mass writes were performed.
- No Firestore rules were deployed.
- No financial data or financial behavior was changed.

