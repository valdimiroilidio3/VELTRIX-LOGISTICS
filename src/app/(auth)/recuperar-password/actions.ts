"use server";

import { headers } from "next/headers";
import { ensureDatabase } from "@/lib/db";
import { requestPasswordReset, resetPasswordWithToken, type ResetRequestResult } from "@/lib/auth/password-reset";
import { AppError } from "@/lib/errors";

export interface RequestState {
  status: "idle" | "done" | "error";
  message?: string;
  delivery?: ResetRequestResult["delivery"];
}

export interface ResetState {
  status: "idle" | "done" | "error";
  message?: string;
}

async function requestIp(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? "unknown";
}

/**
 * Always answers with the same wording for existing and unknown accounts, so the
 * endpoint cannot be used to discover who has an account.
 */
export async function requestResetAction(_prev: RequestState, formData: FormData): Promise<RequestState> {
  await ensureDatabase();
  const email = String(formData.get("email") ?? "").trim();
  try {
    const result = await requestPasswordReset(email, { ip: await requestIp() });
    return {
      status: "done",
      delivery: result.delivery,
      message:
        result.delivery === "email_sent"
          ? "Se existir uma conta com esse endereço, enviámos uma ligação para definir uma nova palavra-passe. Verifique também a pasta de spam."
          : result.delivery === "email_not_configured"
            ? "Pedido registado. Nesta instância a entrega de email ainda não está configurada — peça a um administrador para repor o acesso em Segurança → Utilizadores."
            : result.delivery === "delivery_failed"
              ? "Pedido registado, mas o envio do email falhou no fornecedor. Contacte o administrador da sua organização."
              : "Se existir uma conta com esse endereço, enviámos uma ligação para definir uma nova palavra-passe.",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof AppError ? error.message : "Não foi possível processar o pedido.",
    };
  }
}

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  await ensureDatabase();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  try {
    const result = await resetPasswordWithToken(token, password, confirm, { ip: await requestIp() });
    return { status: result.ok ? "done" : "error", message: result.message };
  } catch {
    return { status: "error", message: "Não foi possível alterar a palavra-passe. Peça uma nova ligação." };
  }
}
