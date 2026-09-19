export const IDENTITY_TYPE = Object.freeze({
  employee: "employee",
  administrative: "administrative",
});

export const IDENTITY_CLASSIFICATION_ERROR = Object.freeze({
  invalidType: "INVALID_IDENTITY_TYPE",
  trustedPathRequired: "TRUSTED_IDENTITY_CLASSIFICATION_REQUIRED",
  employeeMappingMissing: "EMPLOYEE_MAPPING_MISSING",
  employeeMappingConflict: "EMPLOYEE_MAPPING_CONFLICT",
  duplicateEmployeeMapping: "DUPLICATE_EMPLOYEE_MAPPING",
  administrativeEmployeeConflict: "ADMINISTRATIVE_EMPLOYEE_CONFLICT",
});

export const IDENTITY_CLASSIFICATION_FIELDS = Object.freeze([
  "identityType",
  "identityTypeSource",
  "identityTypeClassifiedAt",
  "identityTypeClassifiedAtIso",
  "identityTypeClassifiedBy",
  "identityTypeReason",
  "identityTypeClassificationId",
]);

function text(value) {
  return String(value ?? "").trim();
}

function digits(value) {
  return text(value).replace(/\D/g, "");
}

function employeeIdentity(employee = {}) {
  return {
    id: text(employee.id),
    code: digits(employee.employeeCode || employee.jobId || employee.jobCode),
    nationalId: digits(employee.nationalId || employee.nationalID),
  };
}

function accountIdentity(account = {}) {
  return {
    employeeId: text(account.employeeId),
    code: digits(account.employeeCode || account.jobId || account.jobCode),
    nationalId: digits(account.nationalId || account.nationalID),
  };
}

export function effectiveIdentityType(account = {}) {
  const explicit = text(account.identityType);
  return explicit || IDENTITY_TYPE.employee;
}

export function validateIdentityTypeAssignment(requestedIdentityType, { trusted = false } = {}) {
  const requested = text(requestedIdentityType) || IDENTITY_TYPE.employee;
  if (!Object.values(IDENTITY_TYPE).includes(requested)) {
    return { valid: false, error: IDENTITY_CLASSIFICATION_ERROR.invalidType };
  }
  if (requested === IDENTITY_TYPE.administrative && !trusted) {
    return { valid: false, error: IDENTITY_CLASSIFICATION_ERROR.trustedPathRequired };
  }
  return { valid: true, identityType: requested, error: "" };
}

export function resolveEmployeeMapping(account = {}, employees = []) {
  const keys = accountIdentity(account);
  const hasMappingKey = Boolean(keys.employeeId || keys.code || keys.nationalId);
  if (!hasMappingKey) return { valid: false, employee: null, candidates: [], reason: "missing_keys" };

  const candidates = employees.filter((employee) => {
    const employeeKeys = employeeIdentity(employee);
    return Boolean(
      (keys.employeeId && employeeKeys.id === keys.employeeId) ||
      (keys.code && employeeKeys.code === keys.code) ||
      (keys.nationalId && employeeKeys.nationalId === keys.nationalId)
    );
  });

  const exact = candidates.filter((employee) => {
    const employeeKeys = employeeIdentity(employee);
    return Boolean(
      (!keys.employeeId || employeeKeys.id === keys.employeeId) &&
      (!keys.code || employeeKeys.code === keys.code) &&
      (!keys.nationalId || employeeKeys.nationalId === keys.nationalId)
    );
  });

  if (candidates.length !== 1 || exact.length !== 1) {
    return {
      valid: false,
      employee: null,
      candidates,
      reason: candidates.length ? "conflicting_keys" : "not_found",
    };
  }
  return { valid: true, employee: exact[0], candidates, reason: "exact" };
}

export function validateIdentityClassification({ account = {}, employees = [], accounts = [] } = {}) {
  const identityType = effectiveIdentityType(account);
  if (!Object.values(IDENTITY_TYPE).includes(identityType)) {
    return { valid: false, identityType, error: IDENTITY_CLASSIFICATION_ERROR.invalidType };
  }

  const mapping = resolveEmployeeMapping(account, employees);
  if (identityType === IDENTITY_TYPE.administrative) {
    if (mapping.valid || account.employeeId || account.employeeCode || account.jobId || account.nationalId) {
      return {
        valid: false,
        identityType,
        error: IDENTITY_CLASSIFICATION_ERROR.administrativeEmployeeConflict,
      };
    }
    return { valid: true, identityType, employee: null, error: "" };
  }

  if (!mapping.valid) {
    return {
      valid: false,
      identityType,
      error:
        mapping.reason === "conflicting_keys"
          ? IDENTITY_CLASSIFICATION_ERROR.employeeMappingConflict
          : IDENTITY_CLASSIFICATION_ERROR.employeeMappingMissing,
    };
  }

  const duplicate = accounts.find((candidate) => {
    if (text(candidate.id) === text(account.id)) return false;
    const candidateMapping = resolveEmployeeMapping(candidate, employees);
    return candidateMapping.valid && text(candidateMapping.employee.id) === text(mapping.employee.id);
  });
  if (duplicate) {
    return {
      valid: false,
      identityType,
      employee: mapping.employee,
      duplicateAccount: duplicate,
      error: IDENTITY_CLASSIFICATION_ERROR.duplicateEmployeeMapping,
    };
  }

  return { valid: true, identityType, employee: mapping.employee, error: "" };
}

export function containsIdentityClassificationWrite(payload = {}) {
  return IDENTITY_CLASSIFICATION_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(payload, field));
}
