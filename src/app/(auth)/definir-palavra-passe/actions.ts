"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureDatabase } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { changeOwnPassword } from "@/lib/auth/password-reset";

export interface ChangePasswordState {
  status: "idle" | "done" | "error";
  message?: string;
}

async function requestIp(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? "unknown";
}

export async function changePasswordAction(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  await ensureDatabase();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const result = await changeOwnPassword(
    user,
    {
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    },
    { ip: await requestIp() },
  );

  if (!result.ok) return { status: "error", message: result.message };
  return { status: "done", message: result.message };
}
