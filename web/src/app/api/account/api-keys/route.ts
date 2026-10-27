import { handleCreateKey } from "@/server/gateway/account-handlers";
import { accountKeysDeps } from "@/server/gateway/deps";

// POST { name, spendCapCad?, expiresInDays? } → 201 { key, id, name, prefix, createdAt, expiresAt } ;
// la valeur `key` n'est renvoyée qu'ici. 401 sans session · 403 non propriétaire ou origine · 422.
export async function POST(request: Request) {
  return handleCreateKey(request, await accountKeysDeps());
}
