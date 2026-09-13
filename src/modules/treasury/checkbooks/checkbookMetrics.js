import {
  CHECK_STATUS_IDS,
  calcChecksCount,
  getCheckLifecycle,
  normalizeCheckbookNumber,
} from "./checkbookConstants";

export const getCheckAmount = (check = {}) =>
  Number(check.amount || check.advanceAmountBase || 0);

export const getCheckStatus = (check = {}) => getCheckLifecycle(check);

export const getCheckbookStatusCounts = (books = []) =>
  books.reduce((acc, book) => {
    const status = book.status || "requested";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

export const getCheckStatusCounts = (checks = []) =>
  checks.reduce((acc, check) => {
    const status = getCheckStatus(check);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, Object.fromEntries(CHECK_STATUS_IDS.map((status) => [status, 0])));

export const buildCheckbookPosition = (books = [], checks = []) =>
  books.filter((book) => book.status === "received").map((book) => {
    const from = normalizeCheckbookNumber(book.serialFrom);
    const to = normalizeCheckbookNumber(book.serialTo);
    const inRange = checks.filter((check) => {
      const num = normalizeCheckbookNumber(check.checkNum);
      return (
        Number.isFinite(num) &&
        Number.isFinite(from) &&
        Number.isFinite(to) &&
        num >= from &&
        num <= to &&
        (!check.checkbookId || check.checkbookId === book.id || !books.some((item) => item.id === check.checkbookId))
      );
    });
    const countStatus = (status) => inRange.filter((check) => getCheckStatus(check) === status).length;
    const total = Number(book.checksCount) || calcChecksCount(book.serialFrom, book.serialTo);

    return {
      book,
      total,
      used: inRange.length,
      cashed: countStatus("cashed"),
      uncashed: countStatus("uncashed") + countStatus("delivered"),
      cancelled: countStatus("cancelled"),
      available: Math.max(0, total - inRange.length),
    };
  });

export const getCheckDomainMetrics = (books = [], checks = []) => {
  const checkStatusCounts = getCheckStatusCounts(checks);
  const checkbookStatusCounts = getCheckbookStatusCounts(books);
  const activeBooks = checkbookStatusCounts.received || 0;
  const cancelledCount = checkStatusCounts.cancelled || 0;
  const replacedCount = checkStatusCounts.replaced || 0;

  return {
    totalCheckbooks: books.length,
    activeCheckbooks: activeBooks,
    issuedChecksCount: checks.length,
    totalIssuedAmount: checks.reduce((sum, check) => sum + getCheckAmount(check), 0),
    openChecksCount:
      (checkStatusCounts.issued || 0) +
      (checkStatusCounts.delivered || 0) +
      (checkStatusCounts.uncashed || 0),
    cancelledCount,
    replacedCount,
    treasuryLinkedChecks: checks.filter((check) => check.sourceCollection || check.state || check.type).length,
    settlementLinkedChecks: checks.filter((check) => check.linkedSettlementId || check.requires_settlement || check.requiresSettlement).length,
    checkStatusCounts,
    checkbookStatusCounts,
  };
};
