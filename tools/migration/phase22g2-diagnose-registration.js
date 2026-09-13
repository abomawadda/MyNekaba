/* global process */
import { createAdminContext } from "./firebaseAdminClient.js";
import {
  diagnoseEmployeeIdentity,
  employeeKeys,
  hasDuplicateAccount,
  normalizeDigits,
  normalizeEgyptianPhone,
} from "../../api/_lib/registrationCore.js";

function parseArgs(argv) {
  const options = { projectId: process.env.FIREBASE_PROJECT_ID || "nekaba2026" };
  for (const arg of argv) {
    if (arg.startsWith("--project=")) options.projectId = arg.slice("--project=".length);
  }
  return options;
}

function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

async function readCollection(db, collectionName) {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function main() {
  const { projectId } = parseArgs(process.argv.slice(2));
  const context = await createAdminContext({ projectId });
  const [employees, accounts, requests] = await Promise.all([
    readCollection(context.db, "employees"),
    readCollection(context.db, "user_accounts"),
    readCollection(context.db, "registration_requests"),
  ]);

  const schema = {
    employeeCount: employees.length,
    fieldPresence: {},
    fieldTypes: {
      jobId: {},
      employeeCode: {},
      nationalId: {},
      phone: {},
      phone2: {},
    },
    phoneShapes: {
      local11: 0,
      intl20: 0,
      intl0020: 0,
      tenWithoutZero: 0,
      other: 0,
      empty: 0,
    },
  };

  for (const employee of employees) {
    for (const key of Object.keys(employee)) increment(schema.fieldPresence, key);
    for (const key of Object.keys(schema.fieldTypes)) {
      if (employee[key] !== undefined) increment(schema.fieldTypes[key], typeName(employee[key]));
    }
    const rawPhone = normalizeDigits(employee.phone || employee.phone2 || "");
    if (!rawPhone) schema.phoneShapes.empty += 1;
    else if (/^01\d{9}$/.test(rawPhone)) schema.phoneShapes.local11 += 1;
    else if (/^20\d{10}$/.test(rawPhone)) schema.phoneShapes.intl20 += 1;
    else if (/^0020\d{10}$/.test(rawPhone)) schema.phoneShapes.intl0020 += 1;
    else if (/^1\d{9}$/.test(rawPhone)) schema.phoneShapes.tenWithoutZero += 1;
    else schema.phoneShapes.other += 1;
  }

  const identity = {
    nationalId: process.env.DIAG_NATIONAL_ID || "",
    employeeCode: process.env.DIAG_EMPLOYEE_CODE || process.env.DIAG_JOB_ID || "",
    phone: process.env.DIAG_PHONE || "",
  };

  let identityDiagnosis = null;
  if (identity.nationalId || identity.employeeCode || identity.phone) {
    const diagnosis = diagnoseEmployeeIdentity(employees, identity);
    const duplicate = diagnosis.employee
      ? hasDuplicateAccount(accounts, diagnosis.employee, requests)
      : { duplicate: false, account: null, request: null };
    const keys = diagnosis.employee ? employeeKeys(diagnosis.employee) : {};
    identityDiagnosis = {
      employeeCandidateCount: diagnosis.employeeCandidateCount,
      nationalIdMatch: diagnosis.nationalIdMatch,
      jobIdMatch: diagnosis.jobIdMatch,
      phoneMatch: diagnosis.phoneMatch,
      phone2Match: diagnosis.phone2Match,
      duplicateAccount: Boolean(duplicate.account),
      pendingRequest: Boolean(duplicate.request),
      finalReasonCode: duplicate.account
        ? "IDENTITY_MATCHED_BUT_ACCOUNT_EXISTS"
        : duplicate.request
          ? "PENDING_REQUEST_EXISTS"
          : diagnosis.reasonCode,
      canonicalInputShape: {
        nationalIdLength: normalizeDigits(identity.nationalId).length,
        jobIdLength: normalizeDigits(identity.employeeCode).length,
        phoneLength: normalizeEgyptianPhone(identity.phone).length,
      },
      matchedEmployeeShape: diagnosis.employee
        ? {
            hasEmployeeId: Boolean(keys.employeeId),
            hasJobId: Boolean(keys.employeeCode),
            hasNationalId: Boolean(keys.nationalId),
            phoneCount: keys.phones?.length || 0,
          }
        : null,
    };
  }

  console.log(
    JSON.stringify(
      {
        readOnly: true,
        projectId,
        schema,
        identityDiagnosis,
        productionWrites: "NONE",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
