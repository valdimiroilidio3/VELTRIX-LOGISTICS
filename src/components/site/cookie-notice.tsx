"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

const KEY = "veltrix.cookie.notice.v1";

/**
 * Only strictly necessary cookies are used by default (session + CSRF-safe
 * same-site session cookie). This notice records acknowledgement; no tracking
 * scripts are loaded anywhere in the public site.
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) !== "1") setVisible(true);
    } catch {
      setVisible(false);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-xl border border-line/80 bg-surface/95 p-4 shadow-lift backdrop-blur sm:inset-x-auto sm:right-5 sm:w-[430px]">
      <p className="text-xs leading-relaxed text-muted">
        Usamos apenas cookies essenciais para autenticação e segurança de sessão. Não carregamos publicidade nem
        rastreadores de terceiros. Detalhes na{" "}
        <Link href="/privacy" className="text-accent underline underline-offset-2">
          política de privacidade
        </Link>
        .
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            try {
              window.localStorage.setItem(KEY, "1");
            } catch {
              /* storage unavailable — notice will show again */
            }
            setVisible(false);
          }}
        >
          Entendido
        </Button>
        <Link href="/privacy" className="text-xs text-muted underline underline-offset-2 hover:text-ink">
          Saber mais
        </Link>
      </div>
    </div>
  );
}
