const normalizeKey = (value = "") => String(value ?? "").trim();

const unique = (values = []) =>
  [...new Set(values.map(normalizeKey).filter(Boolean))];

export function buildMemberPortalIdentity(user = {}, employee = null) {
  const employeeDocId = normalizeKey(employee?.id || user?.employeeId);
  const jobCode = normalizeKey(
    employee?.jobId ||
    employee?.employeeCode ||
    user?.employeeCode ||
    user?.jobId ||
    ""
  );
  const employeeLookupKeys = unique([
    user?.employeeId,
    user?.employeeCode,
    user?.jobId,
    user?.id,
  ]);

  const memberIdKeys = unique([
    jobCode,
    employeeDocId,
    user?.employeeCode,
    user?.jobId,
    user?.employeeId,
  ]);

  return {
    employeeDocId,
    jobCode,
    employeeLookupKeys,
    memberIdKeys: memberIdKeys.slice(0, 10),
  };
}
