# Phase 22G.3 - Security Center 2.0 and Email Governance

Date: 2026-09-15
Status: PARTIALLY PASSED - operator acceptance remains

## A. Objective

Implement Security Center 2.0 with trusted account administration, Firebase email verification governance, audited override, lifecycle controls, safe deletion architecture, and printable A4 security reports.

## B. Baseline

Phase 22F through 22G.2 introduced JIT compatibility, Firebase-native registration, pending approval, and production verification diagnostics.

## C. Security Center Previous State

The previous page read Firestore directly and allowed some account mutations through client-side provider functions. It had limited Firebase Auth visibility and no unified email governance model.

## D. Security Center 2.0 Architecture

- Admin-only backend list API: `/api/admin/accounts/list`
- Admin-only backend action API: `/api/admin/accounts/action`
- Frontend consumes trusted API data and no longer directly mutates `user_accounts`
- Firebase Admin SDK stays server-only

## E. Account Status Model

Supported statuses:

- `pending_approval`
- `active`
- `rejected`
- `suspended`
- `deleted`

Legacy `blocked` and `inactive` remain displayed for compatibility.

## F. Email Verification Model

Email status shown as:

- `verified`
- `unverified`
- `overridden`
- `not_applicable`

Firebase Auth `emailVerified` is the source for Firebase-linked accounts. Override is application metadata only.

## G. Email Resend

Admin can generate a Firebase email verification link through the backend. The link is returned to the admin UI for controlled manual delivery/copy because no email delivery service exists in the current architecture.

## H. Email Verification Override

Override requires:

- Admin Firebase ID token
- Trusted `accountId` custom claim
- Active admin account
- Required reason
- Audit log

Override can be removed later.

## I. Login Eligibility Rule

Firebase-native accounts now require:

```text
accountStatus == active
AND
(Firebase emailVerified == true OR emailVerificationOverride == true)
```

Legacy/JIT compatibility is preserved.

## J. Account List

The new list shows account identity, employee code, email, email verification state, role, account status, auth mode, and last sign-in where available.

## K. Account Detail View

The detail drawer shows identity, account mapping, Firebase UID masked, dates, sessions, verification state, and lifecycle actions.

## L. Firebase Metadata

Backend reads:

- Firebase UID
- email
- emailVerified
- disabled
- creationTime
- lastSignInTime

## M. Last Login

Firebase `metadata.lastSignInTime` is displayed when available. Unknown values display as `غير متاح`.

## N. Role Management

Role changes are backend-only, admin-only, whitelist-restricted, audited, and protect the last active admin.

## O. Permission Management

Existing permission model is preserved. No new granular permission migration was introduced.

## P. Approval

Admin can activate pending accounts from Security Center. Email verification still gates Firebase-native login unless override exists.

## Q. Rejection

Admin can reject pending accounts through trusted backend status action with a reason.

## R. Suspension

Admin can suspend accounts. Firebase linked users are disabled and active app sessions are revoked.

## S. Reactivation

Admin can reactivate accounts. Firebase linked users are re-enabled.

## T. Session Revocation

Backend revokes app sessions and Firebase refresh tokens for Firebase-linked accounts.

## U. Account Deletion Architecture

Deletion flow:

1. Deny self-delete.
2. Protect last active admin.
3. Revoke app sessions.
4. Revoke Firebase refresh tokens.
5. Delete Firebase Auth user if present.
6. Mark account as `deleted`.
7. Preserve audit history.
8. Do not delete employee records.

## V. Delete Safety

Deletion requires reason and admin backend authorization. Production delete tests were not executed.

## W. Employee Data Preservation

Employee documents are not deleted or modified.

## X. Financial Data Preservation

No financial modules or financial records were changed.

## Y. Audit Trail

Actions write audit entries for role change, lifecycle status changes, override, resend link generation, session revocation, and deletion.

## Z. Security Reports

Security Center includes printable report cards for:

- Accounts report
- Email verification report
- Security audit report

## AA. Print Architecture

Print uses a dedicated hidden report section with `@media print` rules rather than printing the current table DOM state.

## AB. A4 Acceptance

A4 CSS is included:

```css
@page { size: A4; margin: 14mm; }
```

Runtime print-to-PDF acceptance remains manual.

## AC. Role-Based Security

Admin APIs require trusted admin actor through Firebase ID token and `accountId` claim. Auditor/treasurer/dataEntry/viewer/member cannot perform backend destructive actions unless promoted to admin.

## AD. Mobile UX

The new layout is responsive with horizontal table overflow and drawer-based account details. Manual mobile acceptance remains required.

## AE. Desktop UX

Desktop layout includes KPIs, alerts, tabs, filters, data table, detail drawer, and reports.

## AF. Accessibility

New form fields include `name` attributes, buttons include accessible labels where needed, and the drawer has an explicit close button.

## AG. Corporate Email Delivery Risk

Firebase verification emails may land in Junk/Quarantine. Manual operator should review corporate mail filtering.

## AH. Tests

`node --test --test-reporter=spec tools/migration/*.test.js`

Result: PASS, 62 tests.

## AI. Build

`npm.cmd run build`

Result: PASS.

## AJ. ESLint

`npx.cmd eslint src api tools`

Result: PASS.

## AK. Production Writes

NONE

## AL. Production Deletes

NONE

## AM. Financial Logic Changes

NONE

## AN. Employee Record Deletions

NONE

## AO. Firestore Rules Deployment

NO

## AP. Existing Account Migration

NO

## AQ. Remaining Risks

- Manual runtime acceptance is required for override, resend, suspend/reactivate, delete, and A4 print preview.
- Verification link generation creates a link but does not send mail automatically because no trusted email service exists.
- Security Center uses admin API; the current admin must have a valid Firebase session and `accountId` claim.
- Browser `prompt/confirm` is still used for some high-risk reasons/confirmations; a custom dialog can refine UX later.

## AR. Manual Operator Acceptance

1. Open Security Center as admin.
2. Confirm account list loads with Firebase metadata.
3. Select a controlled account.
4. Generate a verification link and verify cooldown behavior.
5. Apply email override with a reason, then remove it.
6. Approve a pending controlled account.
7. Suspend and reactivate a controlled account.
8. Revoke sessions for a controlled account.
9. Do not test delete on a real employee account unless explicitly designated as test.
10. Open reports and print/save PDF as A4.

## AS. Recommended Next Phase

SECURITY CENTER RUNTIME ACCEPTANCE REQUIRED

## AT. Final Verdict

PHASE 22G.3 PARTIALLY PASSED - OPERATOR ACCEPTANCE REMAINS

## Security Center Acceptance Matrix

| Feature | Code | Tests | Runtime |
|---|---|---|---|
| Account list | PASS | PASS | PENDING |
| Firebase metadata | PASS | PASS | PENDING |
| Email verification badge | PASS | PASS | PENDING |
| Resend verification | PASS | PASS | PENDING |
| Admin override | PASS | PASS | PENDING |
| Approval | PASS | PASS | PENDING |
| Rejection | PASS | PASS | PENDING |
| Suspension | PASS | PASS | PENDING |
| Reactivation | PASS | PASS | PENDING |
| Role change | PASS | PASS | PENDING |
| Permissions | PASS | PASS | PENDING |
| Session revoke | PASS | PASS | PENDING |
| Delete account | PASS | PASS | PENDING |
| Audit log | PASS | PASS | PENDING |
| Security reports | PASS | PASS | PENDING |
| A4 print | PASS | PASS | PENDING |

## File Change Summary

Added:

- `api/admin/accounts/action.js`
- `api/admin/accounts/list.js`
- `tools/migration/phase22g3SecurityGovernance.test.js`
- `migration-output/phase-22g3-security-center-email-governance.md`

Modified:

- `src/modules/security/SecurityCenter.jsx`
- `src/security/registrationApi.js`
- `src/security/firebaseAuth.js`
- `src/app/providers/AuthProvider.jsx`

Deleted:

- None

