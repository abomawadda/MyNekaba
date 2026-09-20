import React, { useRef, useState } from "react";
import { Upload, X, FileText, Paperclip, Download } from "lucide-react";
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { validateSecureAttachment, SECURE_ATTACHMENT_ACCEPT, PERMISSIONS } from "../../security/permissions";
import { hasStoragePermissions, requireStoragePermissions } from "../../security/storageAuthorization";
import { uploadBlobToStorage } from "./attachmentMigration";
import clsx from "clsx";

const MAX_FILES = 10;

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (event) => resolve(event.target.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const formatSize = (size = 0) =>
  size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${(size / 1024).toFixed(0)} KB`;

const buildDoc = (f, url, storagePath = "") => ({
  id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
  name: f.name,
  size: formatSize(f.size),
  type: f.type,
  uploadedAt: new Date().toISOString().split("T")[0],
  url,
  ...(storagePath ? { storagePath } : {}),
});

export default function FileUpload({
  existingFiles = [],
  onChange,
  contextId = "draft",
  businessPermission,
}) {
  const T = useT();
  const { can } = useAuth();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const uploadPermissions = [businessPermission, PERMISSIONS.attachmentsUpload].filter(Boolean);
  const viewPermissions = [PERMISSIONS.treasuryView, PERMISSIONS.attachmentsView];
  const deletePermissions = [businessPermission, PERMISSIONS.attachmentsDelete].filter(Boolean);
  const canUpload = Boolean(businessPermission) && hasStoragePermissions(can, uploadPermissions);
  const canView = hasStoragePermissions(can, viewPermissions);
  const canDelete = Boolean(businessPermission) && hasStoragePermissions(can, deletePermissions);

  const handleUpload = async (e) => {
    if (!requireStoragePermissions(can, uploadPermissions, (message) => alert(message))) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    if (existingFiles.length + files.length > MAX_FILES) {
      alert(`الحد الأقصى ${MAX_FILES} مرفقات لكل مستند.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    for (const f of files) {
      const err = validateSecureAttachment(f);
      if (err) {
        alert(`${f.name}: ${err}`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }
    // الرفع السحابي أولاً — base64 احتياطي فقط عند تعذر التخزين
    setUploading(true);
    try {
      const newDocs = [];
      for (const f of files) {
        try {
          const uploaded = await uploadBlobToStorage(f, f.name, {
            can,
            requiredPermissions: uploadPermissions,
            contextId,
          });
          newDocs.push(buildDoc(f, uploaded.url, uploaded.storagePath));
        } catch (uploadError) {
          console.error("storage upload:", uploadError);
          const dataUrl = await readAsDataUrl(f);
          newDocs.push({ ...buildDoc(f, dataUrl), storagePending: true });
        }
      }
      onChange([...existingFiles, ...newDocs]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = (id) => {
    if (!requireStoragePermissions(can, deletePermissions, (message) => alert(message))) return;
    if (!window.confirm("هل أنت متأكد من حذف هذا المرفق؟")) return;
    onChange(existingFiles.filter(f => f.id !== id));
  };

  return (
    <div className="space-y-3 w-full">
      <div className="flex items-center justify-between">
         <label className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1"><Paperclip size={12}/> المرفقات والوثائق</label>
          {canUpload && <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-[10px] font-black text-teal-600 bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 px-4 py-2 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50">
            <Upload size={12}/> {uploading ? "جارٍ الرفع..." : "رفع ملف جديد"}
          </button>}
      </div>
      
      {canView && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {existingFiles.map((file, i) => (
          <div key={file.id || i} className={clsx("flex items-center justify-between p-2.5 rounded-xl border group hover:border-teal-500 transition-colors", T.sxn)}>
            {/* 🎯 رابط تحميل وعرض المرفق */}
            <a href={file.url} download={file.name} className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" title="انقر لتحميل أو عرض المرفق">
              <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-600 flex items-center justify-center shrink-0">
                <FileText size={18} />
              </div>
              <div className="min-w-0 text-right">
                <p className="text-[10px] font-black truncate text-slate-700 dark:text-slate-200">{file.name}</p>
                <p className="text-[8px] font-bold text-slate-400 mt-0.5">{file.size} • {file.uploadedAt}{file.storagePending ? " • نسخة محلية" : ""}</p>
              </div>
            </a>
            {canDelete && <button type="button" onClick={() => handleDelete(file.id)} className="p-1.5 bg-rose-50 dark:bg-rose-900/20 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0 ml-1" title="حذف المرفق">
              <X size={12}/>
            </button>}
          </div>
        ))}
      </div>}
      
      {canView && existingFiles.length === 0 && (
        <div className="p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-slate-400 gap-2 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
          <FileText size={24} className="opacity-30"/>
          <p className="text-[10px] font-bold">لا توجد مرفقات، استخدم الزر لإضافة المستندات المؤيدة</p>
        </div>
      )}
      {canUpload && <input type="file" ref={fileInputRef} onChange={handleUpload} multiple accept={SECURE_ATTACHMENT_ACCEPT.join(",")} className="hidden" />}
    </div>
  );
}
