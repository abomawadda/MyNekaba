import { resolveTrustedPrincipal } from "./trustedPrincipal.js";

export async function requireAdminActor(req, context) {
  const principal = await resolveTrustedPrincipal(req, context, { requireVersionClaims: false });
  const actor = { ...principal.account, id: principal.accountId, firebaseUid: principal.firebaseUid };
  if (actor.accountStatus !== "active" || actor.role !== "admin") throw new Error("actor_not_admin");

  return actor;
}
