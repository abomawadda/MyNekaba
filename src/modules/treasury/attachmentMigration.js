import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../../app/providers/FirebaseProvider";

export const isDataUrl = (value = "") => String(value || "").startsWith("data:");

export function parseDataUrl(dataUrl = "") {
  const match = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  return { mime: match[1] || "application/octet-stream", base64: !!match[2], body: match[3] || "" };
}

export function dataUrlToBlob(dataUrl = "") {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error("صيغة الملف غير صالحة.");
  if (parsed.base64) {
    const binary = atob(parsed.body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: parsed.mime });
  }
  return new Blob([decodeURIComponent(parsed.body)], { type: parsed.mime });
}

const safeFileName = (name = "file") =>
  String(name || "file").replace(/[^\w.\u0600-\u06FF-]+/g, "_").slice(0, 80) || "file";

export async function uploadBlobToStorage(blob, fileName = "file") {
  const key = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${safeFileName(fileName)}`;
  const fileRef = ref(storage, `settlement_attachments/${key}`);
  await uploadBytes(fileRef, blob, { contentType: blob.type || "application/octet-stream" });
  return getDownloadURL(fileRef);
}

export async function uploadDataUrlToStorage(dataUrl, fileName = "file") {
  return uploadBlobToStorage(dataUrlToBlob(dataUrl), fileName);
}

export function collectDataUrlAttachments({ issuedChecks = [], transactions = [] }) {
  const hits = [];
  const scanFiles = (files, where) => {
    (Array.isArray(files) ? files : []).forEach((file, index) => {
      if (file && isDataUrl(file.url)) {
        hits.push({ ...where, fileIndex: index, name: file.name || "مرفق", size: file.size || "" });
      }
    });
  };
  (issuedChecks || []).forEach((check) => {
    scanFiles(check.attachments, { collection: "issued_checks", docId: check.id, field: "attachments", label: check.checkNum || check.id });
    (Array.isArray(check.settlementExpenses) ? check.settlementExpenses : []).forEach((expense) => {
      scanFiles(expense.files, {
        collection: "issued_checks",
        docId: check.id,
        field: `settlementExpenses:${expense.id}`,
        expenseId: expense.id,
        label: `${check.checkNum || check.id} / ${expense.category || "فاتورة"}`,
      });
    });
  });
  (transactions || []).forEach((tx) => {
    scanFiles(tx.attachments, { collection: "transactions", docId: tx.id, field: "attachments", label: tx.bankReference || tx.id });
  });
  return hits;
}
