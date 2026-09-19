import { createHash } from "node:crypto";

export const PHASE22H2_EXECUTE_CONFIRM = "RECONCILE_PHASE_22H2";
export const ORPHAN_DISPOSITIONS = Object.freeze(["RESTORE", "RETIRE", "HOLD"]);

function normalize(value) {
  return String(value || "").trim();
}
function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "object" && Number.isFinite(value.seconds)) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function maskReference(value = "") {
  const text = normalize(value);
  if (!text) return "";
  if (text.length <= 8) return `${text.slice(0, 2)}***${text.slice(-2)}`;
  return `ref_${createHash("sha256").update(text).digest("hex").slice(0, 8)}`;
}

function stableValue(value) {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
  }
  return value;
}

export function stableChecksum(value) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

export function assertProductionSafeguards(options = {}) {
  if (options.projectId !== "nekaba2026") throw new Error("Phase 22H.2 only permits project nekaba2026.");
  if (options.execute && options.confirm !== PHASE22H2_EXECUTE_CONFIRM) {
    throw new Error(`Execution requires --confirm=${PHASE22H2_EXECUTE_CONFIRM}.`);
  }
}

export function validateRestoreEvidence(evidence = {}) {
  const missing = [];
  for (const field of ["accountId", "firebaseUid", "employeeId", "employeeCode", "email", "role", "accountStatus"]) {
    if (!normalize(evidence[field])) missing.push(field);
  }
  if (!evidence.roleAuthoritative) missing.push("roleAuthoritative");
  if (!evidence.statusAuthoritative) missing.push("statusAuthoritative");
  return { valid: missing.length === 0, missing };
}

export function buildOrphanDispositionPlan(identityCase = {}, disposition = "HOLD", evidence = {}) {
  const selected = normalize(disposition).toUpperCase() || "HOLD";
  if (!ORPHAN_DISPOSITIONS.includes(selected)) throw new Error(`Unsupported orphan disposition: ${selected}`);

  if (selected === "HOLD") {
    return { disposition: selected, authMutations: [], firestoreMutations: [], unresolved: true };
  }

  if (selected === "RETIRE") {
    return {
      disposition: selected,
      authMutations: ["disable", "revoke_refresh_tokens"],
      firestoreMutations: ["retire_registration_request"],
      deleteAuthUser: false,
      unresolved: false,
    };
  }

  const validation = validateRestoreEvidence({ ...identityCase, ...evidence });
  if (!validation.valid) {
    throw new Error(`RESTORE requires authoritative evidence: ${validation.missing.join(", ")}`);
  }
  return {
    disposition: selected,
    authMutations: [],
    firestoreMutations: ["create_application_account", "complete_registration_request"],
    deleteAuthUser: false,
    unresolved: false,
  };
}

export function classifyIdentityRepairCases({ requests = [], accounts = [], authUsers = [], employees = [], audits = [], now = Date.now() } = {}) {
  const accountsById = new Map(accounts.map((account) => [normalize(account.id), account]));
  const authByUid = new Map(authUsers.map((user) => [normalize(user.uid), user]));
  const employeesById = new Map(employees.map((employee) => [normalize(employee.id), employee]));
  const employeeByCode = new Map(
    employees.map((employee) => [normalize(employee.employeeCode || employee.jobId), employee]).filter(([key]) => key)
  );

  const classified = requests.map((request) => {
    const account = accountsById.get(normalize(request.accountId)) || null;
    const authUser = authByUid.get(normalize(request.firebaseUid)) || null;
    const employee =
      employeesById.get(normalize(request.employeeId)) ||
      employeeByCode.get(normalize(request.employeeCode)) ||
      null;
    const expired = toMillis(request.expiresAt) > 0 && toMillis(request.expiresAt) <= Number(now);
    const deletionAudit = audits.find(
      (audit) => audit.action === "security.account_deleted" && normalize(audit.targetId) === normalize(request.accountId)
    ) || null;

    let repairClass = "UNCLASSIFIED";
    if (!account && !authUser && employee && expired && deletionAudit) repairClass = "A";
    else if (!account && authUser) repairClass = "B";
    else if (account && authUser) repairClass = "C";

    return { request, account, authUser, employee, expired, deletionAudit, repairClass };
  });

  return {
    all: classified,
    classA: classified.filter((item) => item.repairClass === "A"),
    classB: classified.filter((item) => item.repairClass === "B"),
    classC: classified.filter((item) => item.repairClass === "C"),
    unclassified: classified.filter((item) => item.repairClass === "UNCLASSIFIED"),
  };
}

export function buildIdentityMaterialFingerprint({ requests = [], accounts = [], authUsers = [] } = {}) {
  return stableChecksum({
    requests: requests.map((request) => ({
      id: request.id,
      status: request.status,
      accountId: request.accountId,
      firebaseUid: request.firebaseUid,
      employeeId: request.employeeId,
      employeeCode: request.employeeCode,
      expiresAt: toMillis(request.expiresAt),
    })),
    accounts: accounts.map((account) => ({
      id: account.id,
      accountStatus: account.accountStatus,
      registrationState: account.registrationState,
      firebaseUid: account.firebaseUid,
      employeeId: account.employeeId,
      employeeCode: account.employeeCode || account.jobId,
      role: account.role,
    })),
    authUsers: authUsers.map((user) => ({
      uid: user.uid,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      disabled: Boolean(user.disabled),
      accountId: user.customClaims?.accountId || "",
    })),
  });
}
