export async function requireAdminActor(req, { auth, db }) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) throw new Error("missing_bearer_token");

  const decoded = await auth.verifyIdToken(token);
  const accountId = String(decoded.accountId || "");
  if (!accountId) throw new Error("missing_account_claim");

  const accountDoc = await db.collection("user_accounts").doc(accountId).get();
  if (!accountDoc.exists) throw new Error("actor_account_missing");
  const actor = { id: accountDoc.id, ...accountDoc.data() };
  if (actor.accountStatus !== "active" || actor.role !== "admin") throw new Error("actor_not_admin");

  return actor;
}
