import "server-only";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface EmailResult {
  ok: boolean;
  providerId?: string;
  error?: string;
  /** true when the failure is "no credentials", not a provider outage */
  notConfigured?: boolean;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Sends a transactional email through Resend when credentials exist.
 * Without credentials it fails explicitly — nothing is ever reported as sent.
 * Network failures are surfaced with the provider status code for retry logic.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return { ok: false, notConfigured: true, error: "RESEND_API_KEY / EMAIL_FROM não configuradas — email não enviado" };
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        reply_to: message.replyTo,
      }),
    });
  } catch (error) {
    return { ok: false, error: `Falha de rede ao contactar o fornecedor de email: ${(error as Error).message}` };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, error: `Fornecedor de email respondeu ${response.status}: ${detail.slice(0, 300)}` };
  }

  const body = (await response.json().catch(() => ({}))) as { id?: string };
  return { ok: true, providerId: body.id };
}
