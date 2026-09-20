import React, { useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../app/providers/FirebaseProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { PERMISSIONS, SECURE_ATTACHMENT_ACCEPT, validateSecureAttachment } from "../../security/permissions";
import {
  buildGeneralAttachmentPath,
  hasStoragePermissions,
  requireStoragePermissions,
  sanitizeAttachmentFileName,
} from "../../security/storageAuthorization";

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "dssokojaq";
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "nekaba_preset";

export default function FileUpload({
  existingFiles = [],
  onChange,
  businessPermission,
  contextId = "general",
}) {
  const { can } = useAuth();
  const [currentNote, setCurrentNote] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSource, setUploadSource] = useState("firebase");
  const uploadPermissions = [businessPermission, PERMISSIONS.attachmentsUpload, PERMISSIONS.attachmentsView].filter(Boolean);
  const viewPermissions = [businessPermission, PERMISSIONS.attachmentsView].filter(Boolean);
  const deletePermissions = [businessPermission, PERMISSIONS.attachmentsDelete].filter(Boolean);
  const canUpload = Boolean(businessPermission) && hasStoragePermissions(can, uploadPermissions);
  const canView = Boolean(businessPermission) && hasStoragePermissions(can, viewPermissions);
  const canDelete = Boolean(businessPermission) && hasStoragePermissions(can, deletePermissions);

  const generateAttachmentId = () => `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const uploadToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", "treasury_docs");
    formData.append("public_id", `${generateAttachmentId()}_${sanitizeAttachmentFileName(file.name)}`);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
      { method: "POST", body: formData }
    );

    if (!response.ok) throw new Error("فشل الرفع إلى Cloudinary");
    const data = await response.json();
    return data.secure_url;
  };

  const uploadToFirebase = async (file) => {
    const storagePath = buildGeneralAttachmentPath({
      contextId,
      attachmentId: generateAttachmentId(),
      fileName: file.name,
    });
    const fileRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(fileRef, file);
    return await getDownloadURL(snapshot.ref);
  };

  const handleFileChange = async (e) => {
    if (!requireStoragePermissions(can, uploadPermissions, (message) => alert(message))) {
      e.target.value = null;
      return;
    }
    const file = e.target.files[0];
    if (!file) return;
    const validationError = validateSecureAttachment(file);
    if (validationError) {
      alert(validationError);
      e.target.value = null;
      return;
    }

    try {
      setIsUploading(true);
      let downloadURL = "";

      if (uploadSource === "cloudinary") {
        downloadURL = await uploadToCloudinary(file);
      } else {
        downloadURL = await uploadToFirebase(file);
      }

      const newAttachment = {
        url: downloadURL,
        note: currentNote || "مستند مالي",
        uploadedAt: Date.now(),
        fileName: file.name,
        source: uploadSource,
      };

      onChange([...existingFiles, newAttachment]);
      setCurrentNote("");
      e.target.value = null;

    } catch (error) {
      console.error("خطأ:", error);
      alert("حدث خطأ أثناء الرفع. تأكد من اتصال الإنترنت.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 space-y-4">
      {canUpload && <div className="flex items-center justify-between border-b pb-2">
        <label className="text-xs font-semibold text-slate-500">مصدر التخزين الآمن</label>
        <div className="flex bg-slate-200 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setUploadSource("cloudinary")}
            className={`px-3 py-1 text-[10px] font-semibold rounded-md transition-all ${uploadSource === 'cloudinary' ? 'bg-white shadow text-brand-700' : 'text-slate-500'}`}
          >
            Cloudinary (PDF/صور)
          </button>
          <button
            type="button"
            onClick={() => setUploadSource("firebase")}
            className={`px-3 py-1 text-[10px] font-semibold rounded-md transition-all ${uploadSource === 'firebase' ? 'bg-white shadow text-brand-700' : 'text-slate-500'}`}
          >
            Firebase Storage
          </button>
        </div>
      </div>}

      {canUpload && <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="بيان المرفق (مثلاً: إيصال سداد)..."
            value={currentNote}
            onChange={(e) => setCurrentNote(e.target.value)}
            disabled={isUploading}
            className="flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-200"
          />

          <label className={`px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all cursor-pointer flex items-center justify-center min-w-[100px] ${isUploading ? "bg-slate-400 text-white animate-pulse" : "bg-brand-600 text-white hover:bg-brand-700 active:scale-95"
            }`}>
            {isUploading ? "جاري الرفع..." : "+ إرفاق مستند"}
            <input type="file" accept={SECURE_ATTACHMENT_ACCEPT.join(",")} className="hidden" onChange={handleFileChange} disabled={isUploading} />
          </label>
        </div>
        <p className="text-[10px] text-slate-400">يُنشئ النظام اسماً عشوائياً آمناً دون تضمين بيانات شخصية.</p>
      </div>}

      {canView && <div className="space-y-2">
        {existingFiles.length > 0 ? (
          <div className="grid grid-cols-1 gap-2">
            {existingFiles.map((file, index) => (
              <div key={index} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border border-slate-100 hover:border-brand-200 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{file.fileName?.endsWith('.pdf') ? '📕' : '🖼️'}</span>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-700">{file.note}</span>
                    <span className="text-[9px] text-slate-400">المصدر: {file.source} | الأصلي: {file.fileName}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a href={file.url} target="_blank" rel="noreferrer" className="px-3 py-1 text-[10px] font-semibold text-brand-700 bg-brand-50 rounded-lg hover:bg-brand-100">عرض</a>
                  {canDelete && <button type="button" onClick={() => {
                    if (!requireStoragePermissions(can, deletePermissions, (message) => alert(message))) return;
                    onChange(existingFiles.filter((_, i) => i !== index));
                  }} className="p-1 text-rose-400 hover:text-rose-600">🗑️</button>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 text-center py-3">لا توجد مستندات مرفقة حالياً.</p>
        )}
      </div>}
    </div>
  );
}
