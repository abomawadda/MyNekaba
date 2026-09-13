const normalizeArabicDigits = (value = "") =>
  String(value)
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit));

export const toNumericValue = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const normalized = normalizeArabicDigits(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatMoney = (value) => {
  const numericValue = toNumericValue(value);
  return numericValue.toFixed(2);
};

export const formatInteger = (value) => {
  const numericValue = toNumericValue(value);
  return String(Math.trunc(numericValue));
};

export const formatMoneyOrDash = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  return formatMoney(value);
};
