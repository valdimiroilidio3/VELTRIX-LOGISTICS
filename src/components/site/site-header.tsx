"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui";

const NAV = [
  { href: "/services", label: "Serviços" },
  { href: "/tracking", label: "Rastreio" },
  { href: "/about", label: "Empresa" },
  { href: "/contact", label: "Contactos" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors duration-300",
        scrolled ? "border-line/70 bg-bg/85 backdrop-blur-xl" : "border-transparent bg-transparent",
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="VELTRIX — página inicial">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-black text-accent-foreground">V</span>
          <span className="text-sm font-semibold tracking-[0.22em] text-ink">VELTRIX</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Navegação principal">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Entrar
          </ButtonLink>
          <ButtonLink href="/request-quote" size="sm">
            Pedir orçamento <ArrowUpRight className="h-3.5 w-3.5" />
          </ButtonLink>
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-lg border border-line/70 text-ink md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open ? (
        <div id="mobile-nav" className="border-t border-line/70 bg-bg/95 px-5 py-4 md:hidden">
          <nav className="flex flex-col" aria-label="Navegação móvel">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg px-2 py-3 text-sm text-ink/90 hover:bg-surface">
                {item.label}
              </Link>
            ))}
            <Link href="/login" className="rounded-lg px-2 py-3 text-sm text-muted hover:bg-surface">
              Entrar na plataforma
            </Link>
            <ButtonLink href="/request-quote" className="mt-2 w-full">
              Pedir orçamento
            </ButtonLink>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
