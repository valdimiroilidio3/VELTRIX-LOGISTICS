import { ok, requireApiPermission, withApi } from "@/lib/api/http";

/** Returns the effective identity and permissions for the current session. */
export const GET = withApi(async () => {
  const user = await requireApiPermission("shipments:read");
  return ok({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    permissions: user.permissions,
    organization: { id: user.organizationId, name: user.organizationName, dataMode: user.organizationDataMode },
    links: { customerId: user.customerId, driverId: user.driverId },
  });
});
