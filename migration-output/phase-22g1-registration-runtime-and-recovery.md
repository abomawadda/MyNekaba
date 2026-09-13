# Phase 22G.1 - Registration Runtime and Recovery

Date: 2026-09-14
Status: PARTIALLY PASSED - operator acceptance remains

## A. Objective

Recover the Phase 22G production registration runtime failure and complete the safe acceptance audit without rebuilding authentication, changing financial logic, deploying Firestore rules, or migrating existing legacy accounts.

## B. Phase 22G Baseline

Phase 22G introduced trusted server registration, Firebase Auth account creation, pending approval, recovery requests, and admin approval endpoints. Runtime registration failed for a real valid employee with the generic identity message.

## C. Environment Variable Audit

The runtime code reads `JIT_AUTH_ALLOWED_ORIGINS` in `api/auth/jit-session.js` and `api/_lib/jitAuthCore.js`. `.env.example` also documents `JIT_AUTH_ALLOWED_ORIGINS`.

## D. Final Origin Variable Name

`JIT_AUTH_ALLOWED_ORIGINS`

## E. Firebase Admin Runtime Readiness

Firebase Admin helpers remain backend-only. A read-only Firestore schema check succeeded using Admin SDK and did not print raw national IDs, phones, emails, tokens, or secrets.

## F. Registration Runtime Architecture

Registration remains server-trusted:

- Frontend submits only identity fields.
- `/api/auth/verify-employee` reads employees server-side.
- `/api/auth/register-complete` creates Firebase Auth and a pending account.
- No frontend broad employee read was restored.

## G. Employee Verification Runtime

Fixed runtime matching for valid employees whose registered phone is stored in equivalent Egyptian formats or alternate phone fields. The strict same-record requirement remains: national ID, employee code/jobId, and phone must all belong to one employee record.

Read-only schema evidence from 50 employee docs:

- `jobId`: present in 50/50
- `nationalId`: present in 50/50
- `phone`: present in 50/50
- `phone2`: present in 3/50
- `employeeCode`: present in 0/50

## H. Verification Token Safety

Token generation and hashed storage remain unchanged from Phase 22G. Tokens are server-generated, short-lived, and scoped to the registration request.

## I. Duplicate Prevention Runtime

Duplicate prevention remains enforced against existing `user_accounts` and active registration requests.

## J. Email Selection Runtime

Stored email selection still uses the server-side employee email. The client cannot silently replace a stored email when `emailMode = registered`.

## K. Email Verification Runtime

Email verification dispatch remains implemented through Firebase after custom-token sign-in. Actual email delivery and link-click completion require operator runtime verification.

## L. Pending Approval Runtime

New accounts remain `pending_approval` after registration and email verification. They are not auto-activated.

## M. Admin Approval Runtime

Approval remains backend-only through `/api/admin/accounts/approve` with Firebase ID token validation and trusted `accountId` claim resolution.

## N. Role Assignment Security

Roles are accepted only from the backend whitelist. High-privilege roles keep the confirmation UI.

## O. Post-Approval Login

Fixed a post-approval blocker: Firebase-native accounts created by registration have no legacy `passwordHash`, so login now uses Firebase email/password directly when `firebaseUid` and email exist.

## P. Firebase-Native Login Path

Firebase-native accounts no longer require legacy password fields. UID mismatch is audited and rejected.

## Q. Legacy/JIT Regression

JIT bridge code path was not replaced. Existing Phase 22F tests still pass.

## R. Normal Password Recovery

Lost-email/identity recovery remains implemented as an admin-reviewed request. Firebase password reset email runtime still requires a dedicated operator-verified flow before marking PASS.

## S. Password Reset Email

PENDING OPERATOR RUNTIME VERIFICATION

## T. Password Reset Runtime Result

PENDING OPERATOR RUNTIME VERIFICATION

## U. Lost Email Recovery

Recovery requests remain generic and do not mutate passwords or email directly.

## V. Recovery Admin Review

Admin recovery completion is still a remaining workflow for a later hardening pass.

## W. New Email Verification

PENDING OPERATOR RUNTIME VERIFICATION

## X. UID/accountId/employeeId Immutability

The implemented login fix does not change `firebaseUid`, `accountId`, or `employeeId`.

## Y. Audit Logging

Registration identity success/failure, account creation, approval, rejection, and recovery request logs remain in place. Failed identity logs use hashes only.

## Z. Rate Limiting

Registration verification uses in-memory IP + identity tuple throttling. This is TEMPORARY / BEST-EFFORT IN SERVERLESS.

## AA. Enumeration Resistance

Identity verification and recovery continue to return generic messages for failure paths.

## AB. API Error Sanitization

New endpoints continue to avoid returning Firebase stack traces or internal errors to users.

## AC. Transaction / Compensation Safety

Registration still performs best-effort rollback for partially-created Firebase/Auth account state.

## AD. Mobile Acceptance

PENDING OPERATOR RUNTIME VERIFICATION at 390px and 430px.

## AE. Desktop Acceptance

PENDING OPERATOR RUNTIME VERIFICATION at 1366px and 1440px.

## AF. Firebase Manual Checklist

- Authentication -> Users: verify new user creation.
- Authentication -> Sign-in method: Email/Password enabled.
- Authorized domains: `mynekaba.vercel.app` present.
- Email verification template: reviewed.
- Password reset template: reviewed.
- Firestore Rules: no deployment in this phase.
- App Check: deferred hardening if not enforced.
- Vercel server env names: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `JIT_AUTH_ALLOWED_ORIGINS`.

## AG. Runtime Acceptance Matrix

| Test | Status | Evidence |
|---|---|---|
| Employee verification | PASS | Fixed phone/jobId normalization and tests passed |
| Registration complete | PENDING | Requires operator retry with real employee |
| Verification email sent | PENDING | Requires inbox/runtime confirmation |
| Email link verified | PENDING | Requires link click |
| Pending approval created | PENDING | Requires real registration completion |
| Admin request visible | PENDING | Requires Security Center check |
| Admin approval | PENDING | Requires admin action |
| Post-approval login | PASS/PENDING | Code blocker fixed; real login requires operator after approval |
| Password reset email | PENDING | Requires operator runtime verification |
| Password reset success | PENDING | Requires operator runtime verification |
| Lost email recovery request | PASS/PENDING | Endpoint implemented; operator UI/runtime verification remains |
| Recovery admin approval | PENDING | Remaining workflow |
| New email verification | PENDING | Remaining workflow |
| JIT canary regression | PASS | Existing JIT tests passed |

## AH. Tests

`node --test --test-reporter=spec tools/migration/*.test.js`

Result: PASS, 54 tests.

## AI. Build

`npm.cmd run build`

Result: PASS.

## AJ. ESLint

`npx.cmd eslint src api tools`

Result: PASS.

## AK. Production Writes

No production data writes were performed by the validation scripts. The user may have attempted registration manually before this fix.

## AL. Financial Logic Changes

NONE

## AM. Firestore Rules Deployment

NO

## AN. Existing Account Migration

NO

## AO. Remaining Risks

- Email verification delivery and click flow were not manually confirmed.
- Admin approval runtime still needs operator acceptance with a real pending request.
- Password reset email flow needs a dedicated operator-verified implementation pass.
- In-memory rate limiting is best-effort on Vercel serverless instances.

## AP. Manual Operator Actions

1. Wait for Vercel to deploy the commit containing this report.
2. Open `https://mynekaba.vercel.app/register`.
3. Retry the same valid employee data that previously failed.
4. Confirm that the employee preview appears.
5. Complete registration with a controlled email and strong password.
6. Confirm receipt of the Firebase verification email.
7. Click the verification link.
8. Open Security Center as admin and confirm the pending request appears.
9. Approve the account.
10. Log in using the new account email/password.
11. Report back which step failed, if any, with the visible Arabic message only.

## AQ. Recommended Next Phase

RUNTIME ACCEPTANCE STILL REQUIRED

## AR. Final Verdict

PHASE 22G.1 PARTIALLY PASSED - OPERATOR ACCEPTANCE REMAINS

