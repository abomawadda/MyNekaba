/**
 * خدمة الخزينة — Treasury Service
 *
 * تتضمن:
 * - حفظ / تحديث السندات في Firestore
 * - حذف السندات والشيكات حذفًا فعليًا من كل أماكنها المحتملة
 * - رفع المرفقات إلى Firebase Storage مع البيان
 * - حذف المرفقات من Storage
 * - فحص تكرار رقم الشيك
 */

import {
  getFirestore,
  doc,
  setDoc,
  writeBatch,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { useFirebase } from "../../../app/providers/FirebaseProvider";
import { useAuth } from "../../../app/providers/AuthProvider";
import { PERMISSIONS } from "../../../security/permissions";
import {
  buildTreasuryAttachmentPath,
  requireManagedAttachmentPath,
  requireStoragePermissions,
  validateStorageUpload,
} from "../../../security/storageAuthorization";
import {
  buildLegacyIssuedCheckId,
  getPendingLegacyCheckTransactions,
  isDirectFinanceType,
  getDefaultRequiresSettlement,
  getSettlementMode,
  getIssuedCheckDisplayParty,
  normalizeIssuedCheckType,
  LEGACY_ISSUED_CHECK_PREFIX,
} from "../helpers/issuedChecks";

const LEGACY_COLLECTION = "transactions";
const BATCH_SIZE = 400;
const ISSUED_CHECKS_COLLECTION = "issued_checks";

const normalizeCollectionName = (value = "") => {
  const name = String(value || "").trim();
  if (name === ISSUED_CHECKS_COLLECTION) return ISSUED_CHECKS_COLLECTION;
  if (name === LEGACY_COLLECTION) return LEGACY_COLLECTION;
  return "";
};

const normalizeCheckNum = (value = "") =>
  String(value ?? "")
    .trim()
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .replace(/[\u0660-\u0669]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit));

const unique = (values = []) =>
  Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));

const removeUndefined = (obj) => {
  const clean = {};
  Object.keys(obj || {}).forEach((key) => {
    if (obj[key] !== undefined) clean[key] = obj[key];
  });
  return clean;
};

const isMigratedLegacyIssuedCheck = (tx = {}) => {
  const id = String(tx?.id || "");
  return Boolean(
    tx?.migratedFromLegacy ||
    tx?.legacySourceId ||
    tx?.sourceTransactionId ||
    id.startsWith(LEGACY_ISSUED_CHECK_PREFIX)
  );
};

const shouldKeepInLegacyTransactions = (tx = {}) => {
  const sourceCollection = normalizeCollectionName(tx?.sourceCollection);

  // الخصومات المباشرة ليست شيكات وتظل في transactions.
  if (isDirectFinanceType(tx?.type)) return true;

  // السجلات القديمة التي تظهر من transactions قبل ترحيلها يجب تحديثها/حذفها من نفس مكانها.
  if (sourceCollection === LEGACY_COLLECTION && !isMigratedLegacyIssuedCheck(tx)) {
    return true;
  }

  return false;
};

function normalizeIssuedCheckPayload(tx = {}, options = {}) {
  const type = normalizeIssuedCheckType(tx.type);
  const explicitRequiresSettlement =
    tx.requires_settlement ?? tx.requiresSettlement ?? options.requires_settlement;
  const requiresSettlement = isDirectFinanceType(type)
    ? false
    : explicitRequiresSettlement === undefined || explicitRequiresSettlement === null
      ? getDefaultRequiresSettlement(type)
      : Boolean(explicitRequiresSettlement);
  const settlementExpenses = Array.isArray(tx.settlementExpenses)
    ? tx.settlementExpenses
    : [];
  const settlementStatus =
    tx.settlementStatus ||
    tx.settlement_state ||
    tx.settlementState ||
    (requiresSettlement && settlementExpenses.length && !tx.isSettled ? "draft" : undefined);

  const raw = {
    ...tx,
    ...options,
    type,
    checkNum: isDirectFinanceType(type) ? "" : normalizeCheckNum(options.checkNum ?? tx.checkNum),
    requires_settlement: requiresSettlement,
    requiresSettlement,
    settlement_mode:
      tx.settlement_mode ||
      tx.settlementMode ||
      options.settlement_mode ||
      getSettlementMode(type, requiresSettlement),
    settlementStatus,
    settlement_state: settlementStatus,
    party: tx.party || getIssuedCheckDisplayParty(tx) || "",
    attachments: Array.isArray(tx.attachments) ? tx.attachments : [],
    state: tx.state || "posted",
  };

  return removeUndefined(raw);
}

export function useTreasuryService() {
  const { app } = useFirebase();
  const { can } = useAuth();
  const db = getFirestore(app);
  const storage = getStorage(app);

  const getTargetCollection = (tx = {}) => {
    const sourceCollection = normalizeCollectionName(tx?.sourceCollection);

    if (sourceCollection === ISSUED_CHECKS_COLLECTION) return ISSUED_CHECKS_COLLECTION;
    if (shouldKeepInLegacyTransactions(tx)) return LEGACY_COLLECTION;

    // القاعدة الصحيحة: أي شيك جديد أو شيك مُرحّل يجب أن يكون في issued_checks.
    return ISSUED_CHECKS_COLLECTION;
  };

  async function saveTransaction(tx) {
    const targetCollection = getTargetCollection(tx);
    const txId = tx.id || doc(collection(db, targetCollection)).id;
    const normalizedType = normalizeIssuedCheckType(tx.type);
    if (!isDirectFinanceType(normalizedType) && tx.checkNum) {
      const duplicate = await isChequeDuplicate(tx.checkNum, txId);
      if (duplicate) {
        throw new Error("رقم الشيك مستخدم بالفعل ولا يمكن تكراره");
      }
    }
    const requiresSettlement = isDirectFinanceType(normalizedType)
      ? false
      : tx.requires_settlement === undefined && tx.requiresSettlement === undefined
        ? getDefaultRequiresSettlement(normalizedType)
        : Boolean(tx.requires_settlement ?? tx.requiresSettlement);
    const settlementExpenses = Array.isArray(tx.settlementExpenses)
      ? tx.settlementExpenses
      : [];
    const settlementStatus =
      tx.settlementStatus ||
      tx.settlement_state ||
      tx.settlementState ||
      (requiresSettlement && settlementExpenses.length && !tx.isSettled ? "draft" : undefined);

    const finalData = normalizeIssuedCheckPayload(tx, {
      id: txId,
      sourceCollection: targetCollection,
      checkNum: isDirectFinanceType(normalizedType) ? "" : tx.checkNum,
      requires_settlement: requiresSettlement,
      requiresSettlement,
      settlement_mode: isDirectFinanceType(normalizedType)
        ? "none"
        : tx.settlement_mode || getSettlementMode(normalizedType, requiresSettlement),
      settlementExpenses,
      settlementStatus,
      settlement_state: settlementStatus,
      isSettled: requiresSettlement ? Boolean(tx.isSettled) : false,
      updatedAt: new Date().toISOString(),
      createdAt: tx.createdAt || new Date().toISOString(),
    });

    await setDoc(doc(db, targetCollection, txId), finalData, { merge: false });
    return txId;
  }

  async function migrateLegacyChecksToIssuedChecks({
    legacyTransactions = [],
    issuedChecks = [],
  } = {}) {
    const pendingTransactions = getPendingLegacyCheckTransactions(
      legacyTransactions,
      issuedChecks
    );

    if (!pendingTransactions.length) {
      return { migratedCount: 0, batches: 0 };
    }

    const now = new Date().toISOString();
    let migratedCount = 0;
    let batches = 0;

    for (let index = 0; index < pendingTransactions.length; index += BATCH_SIZE) {
      const slice = pendingTransactions.slice(index, index + BATCH_SIZE);
      const batch = writeBatch(db);

      slice.forEach((tx) => {
        const migratedId = buildLegacyIssuedCheckId(tx.id);
        const normalized = normalizeIssuedCheckPayload(tx, {
          id: migratedId,
          sourceCollection: ISSUED_CHECKS_COLLECTION,
          legacySourceId: tx.id,
          sourceTransactionId: tx.id,
          legacySourceCollection: LEGACY_COLLECTION,
          migratedFromLegacy: true,
          migratedAt: now,
          originalLegacyType: tx.type,
          createdAt: tx.createdAt || now,
          updatedAt: now,
          state: tx.state || "posted",
        });

        batch.set(doc(db, ISSUED_CHECKS_COLLECTION, migratedId), normalized, { merge: true });
        migratedCount += 1;
      });

      await batch.commit();
      batches += 1;
    }

    return { migratedCount, batches };
  }

  const addDeleteRef = (refs, collectionName, docId) => {
    const cleanCollection = normalizeCollectionName(collectionName);
    const cleanId = String(docId || "").trim();
    if (!cleanCollection || !cleanId) return;
    refs.set(`${cleanCollection}/${cleanId}`, doc(db, cleanCollection, cleanId));
  };

  async function addMatchingCheckRefsByField(refs, collectionName, fieldName, value) {
    const cleanCollection = normalizeCollectionName(collectionName);
    const cleanValue = String(value || "").trim();
    if (!cleanCollection || !fieldName || !cleanValue) return;

    const snap = await getDocs(
      query(collection(db, cleanCollection), where(fieldName, "==", cleanValue))
    );
    snap.docs.forEach((item) => addDeleteRef(refs, cleanCollection, item.id));
  }

  const getDeleteDocumentRefs = async (tx = {}) => {
    const refs = new Map();
    const id = String(tx?.id || "").trim();
    if (!id) return [];

    const targetCollection = getTargetCollection(tx);
    const sourceIds = unique([
      id,
      tx?.legacySourceId,
      tx?.sourceTransactionId,
      id.startsWith(LEGACY_ISSUED_CHECK_PREFIX)
        ? id.slice(LEGACY_ISSUED_CHECK_PREFIX.length)
        : "",
    ]);

    addDeleteRef(refs, targetCollection, id);

    if (isDirectFinanceType(tx?.type)) {
      addDeleteRef(refs, LEGACY_COLLECTION, id);
      return Array.from(refs.values());
    }

    sourceIds.forEach((sourceId) => {
      addDeleteRef(refs, ISSUED_CHECKS_COLLECTION, sourceId);
      addDeleteRef(refs, LEGACY_COLLECTION, sourceId);
      addDeleteRef(refs, ISSUED_CHECKS_COLLECTION, buildLegacyIssuedCheckId(sourceId));
    });

    // حماية إضافية لأي سجلات مرحّلة تشير للشيك كمصدر.
    await Promise.all(
      sourceIds.flatMap((sourceId) => [
        addMatchingCheckRefsByField(refs, ISSUED_CHECKS_COLLECTION, "legacySourceId", sourceId),
        addMatchingCheckRefsByField(refs, ISSUED_CHECKS_COLLECTION, "sourceTransactionId", sourceId),
      ])
    );

    return Array.from(refs.values());
  };

  async function deleteTransaction(tx) {
    if (!requireStoragePermissions(can, [PERMISSIONS.treasuryDelete, PERMISSIONS.attachmentsDelete])) {
      throw new Error("لا تملك صلاحية حذف المستند ومرفقاته.");
    }
    const groupedIds = Array.isArray(tx?.settlementGroupMemberIds)
      ? tx.settlementGroupMemberIds.filter(Boolean)
      : [];
    if (groupedIds.length > 1 || Number(tx?.settlementGroupCount || 0) > 1) {
      throw new Error("لا يمكن حذف تسوية مجمعة من شاشة المستندات");
    }

    if (tx?.attachments?.length) {
      await Promise.allSettled(
        tx.attachments.map((att) => deleteAttachment(att.storagePath))
      );
    }

    const refs = await getDeleteDocumentRefs(tx);
    if (!refs.length) return;

    for (let index = 0; index < refs.length; index += BATCH_SIZE) {
      const slice = refs.slice(index, index + BATCH_SIZE);
      const batch = writeBatch(db);
      slice.forEach((refDoc) => batch.delete(refDoc));
      await batch.commit();
    }
  }

  async function isChequeDuplicate(chequeNum, currentId = null) {
    const normalizedChequeNum = normalizeCheckNum(chequeNum);
    if (!normalizedChequeNum) return false;

    const q = query(
      collection(db, ISSUED_CHECKS_COLLECTION),
      where("checkNum", "==", normalizedChequeNum)
    );
    const snap = await getDocs(q);

    return snap.docs.some((d) => d.id !== currentId);
  }

  async function uploadAttachment(
    file,
    txId,
    description = "",
    onProgress = null,
    options = {}
  ) {
    const businessPermission = options.businessPermission || PERMISSIONS.treasuryCreate;
    const requiredPermissions = [
      businessPermission,
      PERMISSIONS.attachmentsUpload,
      PERMISSIONS.attachmentsView,
    ];
    if (!requireStoragePermissions(can, requiredPermissions)) {
      throw new Error("لا تملك صلاحية رفع هذا المرفق.");
    }
    if (!txId) throw new Error("txId مطلوب لرفع المرفق");
    const validationError = validateStorageUpload(file);
    if (validationError) throw new Error(validationError);

    const timestamp = Date.now();
    const attachmentId = `att_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = buildTreasuryAttachmentPath({
      transactionId: txId,
      attachmentId,
      fileName: file.name,
    });

    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          onProgress?.(progress);
        },
        (error) => reject(error),
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            id: `att_${timestamp}`,
            name: file.name,
            description: description.trim(),
            url: downloadURL,
            storagePath,
            size: file.size,
            mimeType: file.type,
            uploadedAt: new Date().toISOString(),
          });
        }
      );
    });
  }

  async function deleteAttachment(storagePath, businessPermission = PERMISSIONS.treasuryDelete) {
    if (!storagePath) return;
    if (!requireStoragePermissions(can, [businessPermission, PERMISSIONS.attachmentsDelete])) {
      throw new Error("لا تملك صلاحية حذف هذا المرفق.");
    }
    const managedPath = requireManagedAttachmentPath(storagePath);
    try {
      await deleteObject(ref(storage, managedPath));
    } catch (err) {
      if (err.code !== "storage/object-not-found") {
        console.warn("فشل حذف المرفق من Storage:", err);
      }
    }
  }

  return {
    saveTransaction,
    migrateLegacyChecksToIssuedChecks,
    deleteTransaction,
    isChequeDuplicate,
    uploadAttachment,
    deleteAttachment,
  };
}
