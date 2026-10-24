"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { submitContactMessage } from "@/lib/domain/commercial";
import { consumeWithSweep } from "@/lib/rate-limit";
import { ensureDatabase } from "@/lib/db";
import { logError } from "@/lib/errors";
import { env } from "@/lib/env";

const schema = z.object({
  name: z.string().trim().min(2, "Indique o seu nome").max(120),
  email: z.string().trim().toLowerCase().email("Email inválido").max(200),
  topic: z.string().trim().max(40).default("geral"),
  message: z.string().trim().min(10, "Descreva o pedido com pelo menos 10 caracteres").max(1500),
});

export interface ContactState {
  status: "idle" | "success" | "error";
  message?: string;
  emailConfigured?: boolean;
  fieldErrors?: Record<string, string>;
}

export async function sendContactMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
  await ensureDatabase();
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!consumeWithSweep(`contact:${ip}`, 5, 10 * 60_000).allowed) {
    return { status: "error", message: "Demasiados envios a partir deste endereço. Tente novamente mais tarde." };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    topic: formData.get("topic") ?? "geral",
    message: formData.get("message"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", message: "Verifique os campos assinalados.", fieldErrors };
  }

  try {
    await submitContactMessage(parsed.data, { ip });
    return {
      status: "success",
      emailConfigured: env.email.configured,
      message: env.email.configured
        ? "Mensagem registada e encaminhada para a equipa."
        : "Mensagem registada na plataforma. A confirmação por email não é enviada enquanto a integração de email não estiver configurada.",
    };
  } catch (error) {
    logError("contact.submit", error);
    return { status: "error", message: "Não foi possível registar a mensagem. Tente novamente." };
  }
}
