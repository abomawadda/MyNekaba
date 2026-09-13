export const escapeHtml = (value = "") => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

export const sanitizeCell = (value, fallback = "—") => {
  const text = value === null || value === undefined || value === "" ? fallback : value;
  const str = String(text);
  if (/^[=+\-@\t\r]/.test(str)) return `'${escapeHtml(str)}`;
  return escapeHtml(str);
};
