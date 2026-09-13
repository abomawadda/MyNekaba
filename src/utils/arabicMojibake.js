const decoder1256 = new TextDecoder("windows-1256");
const decoderUtf8 = new TextDecoder("utf-8");

const charTo1256Byte = (() => {
  const map = new Map();
  for (let i = 0; i < 256; i += 1) {
    const ch = decoder1256.decode(Uint8Array.from([i]));
    if (!map.has(ch)) map.set(ch, i);
  }
  return map;
})();

const countMojibakeMarkers = (text = "") => {
  const chunkMarkers = (text.match(/[طظ][^\s]/g) || []).length;
  const latinArtifacts = (text.match(/[âœ€]/g) || []).length;
  return chunkMarkers + latinArtifacts;
};

export const isLikelyArabicMojibake = (value = "") => {
  const text = String(value || "");
  if (!text) return false;
  if (countMojibakeMarkers(text) < 2) return false;
  return /[طظâ]/.test(text);
};

export const repairArabicMojibake = (value = "") => {
  const text = String(value || "");
  if (!text || !isLikelyArabicMojibake(text)) return text;

  const bytes = [];
  for (const ch of text) {
    const byteValue = charTo1256Byte.get(ch);
    if (byteValue === undefined) return text;
    bytes.push(byteValue);
  }

  const repaired = decoderUtf8.decode(Uint8Array.from(bytes));
  if (!repaired || repaired.includes("�")) return text;

  const originalScore = countMojibakeMarkers(text);
  const repairedScore = countMojibakeMarkers(repaired);
  const hasArabic = /[\u0600-\u06FF]/.test(repaired);
  if (hasArabic && repairedScore < originalScore) return repaired;

  return text;
};

