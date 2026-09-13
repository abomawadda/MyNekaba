import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEmployeePreview,
  findStrictEmployee,
  hasDuplicateAccount,
  maskEmail,
  maskNationalId,
  matchesEmployeeIdentity,
  normalizeEgyptianPhone,
  validatePasswordPolicy,
} from "../../api/_lib/registrationCore.js";

const employee = {
  id: "emp-doc-1",
  name: "Test Employee",
  nationalId: "29101010101010",
  employeeCode: "1234",
  phone: "01012345678",
  email: "member@example.com",
};

test("phase 22g employee identity requires strict same-record matching", () => {
  assert.equal(
    matchesEmployeeIdentity(employee, {
      nationalId: "29101010101010",
      employeeCode: "1234",
      phone: "01012345678",
    }),
    true
  );
  assert.equal(
    matchesEmployeeIdentity(employee, {
      nationalId: "29101010101010",
      employeeCode: "1234",
      phone: "01000000000",
    }),
    false
  );
});

test("phase 22g.1 accepts equivalent Egyptian phone formats on the same employee", () => {
  assert.equal(normalizeEgyptianPhone("+20 101 234 5678"), "01012345678");
  assert.equal(normalizeEgyptianPhone("1012345678"), "01012345678");
  assert.equal(
    matchesEmployeeIdentity(
      { ...employee, phone: "+20 101 234 5678" },
      {
        nationalId: "29101010101010",
        employeeCode: "1234",
        phone: "01012345678",
      }
    ),
    true
  );
});

test("phase 22g.1 can match a registered alternate phone without cross-record OR matching", () => {
  assert.equal(
    matchesEmployeeIdentity(
      { ...employee, phone: "", phone2: "01012345678" },
      {
        nationalId: "29101010101010",
        employeeCode: "1234",
        phone: "01012345678",
      }
    ),
    true
  );
  assert.equal(
    matchesEmployeeIdentity(
      { ...employee, phone: "", phone2: "01012345678" },
      {
        nationalId: "29101010101010",
        employeeCode: "9999",
        phone: "01012345678",
      }
    ),
    false
  );
});

test("phase 22g employee verification does not use OR matching", () => {
  const result = findStrictEmployee(
    [
      employee,
      { id: "emp-doc-2", nationalId: "30000000000000", employeeCode: "9999", phone: "01012345678" },
    ],
    { nationalId: "29101010101010", employeeCode: "9999", phone: "01012345678" }
  );

  assert.equal(result.employee, null);
});

test("phase 22g preview masks national id and email", () => {
  assert.equal(maskNationalId("29101010101010"), "29**********10");
  assert.equal(maskEmail("member@example.com"), "m***@example.com");
  const preview = buildEmployeePreview(employee);
  assert.equal(preview.maskedNationalId, "29**********10");
  assert.equal(preview.maskedEmail, "m***@example.com");
});

test("phase 22g duplicate prevention uses employee identity, not email alone", () => {
  const duplicate = hasDuplicateAccount(
    [{ id: "account-1", employeeId: "emp-doc-1", email: "other@example.com" }],
    employee,
    []
  );

  assert.equal(duplicate.duplicate, true);
});

test("phase 22g password policy rejects weak and profile-derived passwords", () => {
  assert.equal(validatePasswordPolicy("12345678", {}).valid, false);
  assert.equal(
    validatePasswordPolicy("Member@123", { fullName: "Member" }).valid,
    false
  );
  assert.equal(validatePasswordPolicy("S3cure!Pass", {}).valid, true);
});
