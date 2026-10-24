import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { ensureDatabase } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "Plataforma", template: "%s · VELTRIX" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await ensureDatabase();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Accounts provisioned with a temporary password cannot use the platform
  // until they set their own — enforced on the server, not in the UI.
  if (user.mustChangePassword) redirect("/definir-palavra-passe");
  return <AppShell user={user}>{children}</AppShell>;
}
