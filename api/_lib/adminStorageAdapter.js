import { getStorage } from "firebase-admin/storage";

export function createAdminStorageAdapter({ app, bucketName }) {
  if (!app) throw new Error("firebase_admin_app_required");
  if (!bucketName) throw new Error("firebase_storage_bucket_required");
  const bucket = getStorage(app).bucket(bucketName);

  return {
    async save({ path, data, contentType, metadata }) {
      const file = bucket.file(path);
      await file.save(data, {
        resumable: false,
        validation: "crc32c",
        metadata: {
          contentType,
          cacheControl: "private, no-store, max-age=0",
          metadata,
        },
      });
      return { path };
    },
    async getMetadata(path) {
      const [metadata] = await bucket.file(path).getMetadata();
      return {
        contentType: metadata.contentType || "application/octet-stream",
        size: Number(metadata.size || 0),
        metadata: metadata.metadata || {},
      };
    },
    createReadStream(path) {
      return bucket.file(path).createReadStream({ validation: true });
    },
    async delete(path) {
      const [response] = await bucket.file(path).delete({ ignoreNotFound: true });
      return { deleted: Boolean(response) };
    },
  };
}
