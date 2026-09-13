# Phase 22G.2 - Production Registration Blocker Diagnosis and Fix

Date: 2026-09-14
Status: PASSED - root-cause fix deployed-ready, operator retry required

## A. Incident Summary

A valid production employee could not pass registration Step 1 at `/register`. The failure occurred before email, password, Firebase Auth creation, and pending approval.

## B. Production Symptom

The user-facing message remained the generic identity verification failure:

`تعذر التحقق من البيانات المدخلة. راجع البيانات وحاول مرة أخرى.`

## C. Verified Failure Stage

The failure is at or before `/api/auth/verify-employee`.

## D. Deployed Code Version

Before this fix, a safe GET to production returned 405 and did not include `X-Auth-Flow-Version: 22G.2`. This phase adds that header to verify deployment alignment after Vercel publishes the new commit.

## E. Request Contract

Frontend sends:

```json
{
  "nationalId": "...",
  "employeeCode": "...",
  "phone": "..."
}
```

Backend accepts `employeeCode`, `jobCode`, or `jobId` and maps them to the employee `jobId`/code comparison.

## F. Frontend Field Names

- `nationalId`
- `jobCode` in component state
- sent as `employeeCode`
- `phone`

## G. Backend Expected Field Names

- `nationalId`
- `employeeCode` / `jobCode` / `jobId`
- `phone`

## H. Firestore Employee Field Schema

Read-only diagnostic against production:

- employee documents: 1128
- `jobId`: 1128
- `employeeCode`: 0
- `nationalId`: 1128
- `phone`: 1128
- `phone2`: 1128

## I. Field Type Distribution

- `jobId`: string 1128
- `nationalId`: string 1128
- `phone`: string 1128
- `phone2`: string 1128
- `employeeCode`: not present

## J. National ID Normalization

Fixed a confirmed code defect: Arabic/Persian digit conversion used corrupted mojibake lookup strings. Arabic/Persian digits now convert through Unicode code-point arithmetic without losing or corrupting digits.

## K. Job ID Normalization

`employeeCode` input remains explicitly compared against Firestore `jobId`. Mixed string/number handling remains string-normalized without converting identifiers to JavaScript numbers.

## L. Phone Normalization

Canonical internal phone format remains Egyptian local form, e.g. `01012345678`.

Supported equivalent inputs now include:

- `01012345678`
- `+201012345678`
- `201012345678`
- `00201012345678`
- `1012345678`

## M. Same-Record Matching

Matching remains strict:

`same employee record AND nationalId match AND jobId match AND phone/phone2 match`

No OR identity matching was introduced.

## N. Duplicate Account Check

Duplicate account detection remains active. Expired `identity_verified` registration requests no longer block safe restart.

## O. Registration Request State

Active registration requests still block duplicate registration. Expired Step 1 verification requests are ignored for restart.

## P. Rate Limiting Check

Rate limiting remains in-memory best-effort per serverless instance and now logs server-only reason code `REQUEST_RATE_LIMITED`.

## Q. Origin Validation Check

No new origin variable was introduced. The final origin env remains:

`JIT_AUTH_ALLOWED_ORIGINS`

## R. Root Cause

ROOT CAUSE: backend digit normalization used corrupted Arabic/Persian digit lookup strings, so valid identifiers entered or stored with Arabic/Persian numerals could fail strict verification; production also lacked safe correlation diagnostics to identify the exact reason code.

Contributing production data fact: `employeeCode` is not present in employee documents; `jobId` is the real production field and remains the field used for matching.

## S. Fix Applied

- Replaced corrupted digit conversion with Unicode-safe conversion.
- Added `0020...` Egyptian phone canonicalization.
- Preserved explicit `employeeCode` input to `jobId` employee matching.
- Added server-only reason-code diagnostics.
- Added `verificationCorrelationId`.
- Added `X-Auth-Flow-Version: 22G.2`.
- Ignored expired Step 1 verification requests during duplicate restart checks.
- Added read-only diagnostic tool.
- Added regression tests for Arabic/Persian digits, phone formats, phone2, same-record security, and expired requests.

## T. Security Impact

Security posture is preserved:

- Triple matching remains strict.
- No raw identifiers are returned.
- Reason codes are server-only.
- Public response remains generic.
- Correlation ID is non-sensitive.

## U. Regression Safety

JIT bridge architecture was not changed. Existing JIT tests pass.

## V. Diagnostic Logs Added

Server logs now include structured, non-sensitive reason codes:

- `VERIFY_OK`
- `INVALID_INPUT_FORMAT`
- `NATIONAL_ID_NO_MATCH`
- `JOB_ID_NO_MATCH`
- `PHONE_NO_MATCH`
- `MULTIPLE_EMPLOYEE_MATCHES`
- `IDENTITY_MATCHED_BUT_ACCOUNT_EXISTS`
- `PENDING_REQUEST_EXISTS`
- `REQUEST_RATE_LIMITED`
- `INTERNAL_VERIFY_ERROR`

## W. Sensitive Data Logging

NONE

## X. Production Writes During Diagnosis

NONE

## Y. Firestore Rules Deployment

NO

## Z. Financial Logic Changes

NONE

## AA. Existing Account Migration

NO

## AB. Tests

`node --test --test-reporter=spec tools/migration/*.test.js`

Result: PASS, 57 tests.

## AC. Build

`npm.cmd run build`

Result: PASS.

## AD. ESLint

`npx.cmd eslint src api tools`

Result: PASS.

## AE. Manual Operator Retry

After Vercel deploys this commit:

1. Open `https://mynekaba.vercel.app/register`.
2. Enter the same valid employee data.
3. Click verification.
4. Stop at the employee preview step.
5. If it still fails, send only the visible reference code `vrf_...`.

## AF. Expected Runtime Result

Valid production employee -> Step 1 verification -> employee preview appears.

## AG. Remaining Risks

- The exact real employee values were not entered into diagnostic tooling, so operator retry is still required.
- If Step 1 still fails, the new correlation ID and server reason code will identify the exact remaining blocker without exposing sensitive data.

## AH. Recommended Next Step

READY FOR OPERATOR REGISTRATION RETRY

## AI. Final Verdict

PHASE 22G.2 PASSED - ROOT CAUSE FIXED, OPERATOR RETRY REQUIRED

