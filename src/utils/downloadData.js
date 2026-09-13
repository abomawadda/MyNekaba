const FORMATS = [
  { value: "xlsx", label: "Excel (XLSX)" },
  { value: "json", label: "JSON" },
];

export function getDownloadFormats() {
  return FORMATS;
}

export async function downloadAs(format, data, filename) {
  const safeData = Array.isArray(data) ? data.map(sanitizeRowForSpreadsheet) : data;
  if (format === "json") {
    const blob = new Blob([JSON.stringify(safeData, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `${filename}.json`);
    return;
  }

  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(safeData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function sanitizeRowForSpreadsheet(row) {
  if (!row || typeof row !== "object") return row;
  const out = Array.isArray(row) ? [] : {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(value)) {
      out[key] = `'${value}`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
