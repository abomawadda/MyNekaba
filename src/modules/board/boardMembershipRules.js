import {
  buildBoardMemberViewsFromMemberships,
  normalizeBoardMembership,
} from "./boardLifecycle.js";
import { parseEmployeeDate } from "../../utils/memberBenefits.js";

export const BOARD_ROLE_RANK = {
  "رئيس المجلس": 1,
  "الأمين العام": 2,
  "أمين الصندوق": 3,
  "نائب الرئيس": 3,
  "عضو مجلس إدارة": 4,
  "عضو مجلس": 4,
};

export const getBoardRoleRank = (role = "") =>
  BOARD_ROLE_RANK[String(role || "").trim()] ?? 99;

export const getMemberRole = (member = {}) =>
  String(
    member?.boardMembership?.role ||
    member?.boardRoleTitle ||
    member?.membershipStatus ||
    member?.role ||
    ""
  ).trim();

const normalizeDigits = (value = "") =>
  String(value ?? "")
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
    .trim();

export const getMemberJobNumber = (member = {}) => {
  const raw = normalizeDigits(
    member?.jobId || member?.memberJobId || member?.snapshot?.jobId || ""
  );
  if (raw === "") return Number.MAX_SAFE_INTEGER;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
};

export const compareJobNumberValues = (aJobId = "", bJobId = "") => {
  const a = normalizeDigits(aJobId);
  const b = normalizeDigits(bJobId);
  const aEmpty = a === "";
  const bEmpty = b === "";
  if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
  if (!aEmpty) {
    const aNum = Number(a);
    const bNum = Number(b);
    if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
    const strDiff = a.localeCompare(b, "ar");
    if (strDiff !== 0) return strDiff;
  }
  return 0;
};

export const compareJobNumbers = (a, b) => {  const diff = getMemberJobNumber(a) - getMemberJobNumber(b);
  if (diff !== 0) return diff;
  return String(a?.jobId || a?.memberJobId || "").localeCompare(
    String(b?.jobId || b?.memberJobId || ""),
    "ar"
  );
};

export const compareBoardMembers = (a = {}, b = {}) => {
  const roleDiff = getBoardRoleRank(getMemberRole(a)) - getBoardRoleRank(getMemberRole(b));
  if (roleDiff !== 0) return roleDiff;
  const jobDiff = compareJobNumbers(a, b);
  if (jobDiff !== 0) return jobDiff;
  return String(a?.id || a?.memberId || "").localeCompare(String(b?.id || b?.memberId || ""));
};

export const sortBoardMembersUnified = (members = []) => [...members].sort(compareBoardMembers);

const toDayString = (value = "") => {
  if (!value) return "";
  const text = String(value).trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = parseEmployeeDate(value);
  if (!parsed) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

export const isMembershipCoveringDate = (membership = {}, dateStr = "") => {
  const day = toDayString(dateStr);
  if (!day) return true;
  const normalized = normalizeBoardMembership(membership);
  const from = toDayString(normalized.joinDate);
  const to = toDayString(normalized.endDate);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};

export const getTermMemberViews = (memberships = [], employees = [], termId = "") =>
  sortBoardMembersUnified(
    buildBoardMemberViewsFromMemberships(memberships, employees, { termId })
  );

export const getMembersCoveringDate = (memberships = [], employees = [], termId = "", dateStr = "") => {
  const views = buildBoardMemberViewsFromMemberships(memberships, employees, { termId });
  return sortBoardMembersUnified(
    views.filter((view) =>
      isMembershipCoveringDate(view.boardMembership || {}, dateStr || new Date())
    )
  );
};
