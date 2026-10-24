import { ok, withApi } from "@/lib/api/http";
import { destroySession } from "@/lib/auth/session";

export const POST = withApi(async () => {
  await destroySession();
  return ok({ loggedOut: true });
});
