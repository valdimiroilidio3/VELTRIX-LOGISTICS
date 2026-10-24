import Link from "next/link";

const COLUMNS = [
  {
    title: "Operações",
    links: [
      { href: "/services", label: "Serviços de transporte" },
      { href: "/services#distribuicao", label: "Distribuição e última milha" },
      { href: "/services#armazenagem", label: "Armazenagem" },
      { href: "/tracking", label: "Rastreio de encomendas" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { href: "/about", label: "Sobre a VELTRIX" },
      { href: "/contact", label: "Contactos" },
      { href: "/request-quote", label: "Pedido de orçamento" },
      { href: "/login", label: "Plataforma" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacidade e RGPD" },
      { href: "/terms", label: "Termos de utilização" },
      { href: "/contact#cookies", label: "Cookies" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line/70 bg-[#06111c]">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-black text-accent-foreground">V</span>
            <span className="text-sm font-semibold tracking-[0.22em]">VELTRIX</span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            Logistics &amp; Technology. Coordenamos encomendas, transportes, distribuição e armazenagem com
            rastreabilidade em cada etapa.
          </p>
          <p className="mt-6 text-[11px] leading-relaxed text-muted/70">
            Marca e identidade em validação antes do lançamento comercial. Informação institucional sujeita a
            confirmação jurídica e fiscal.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{column.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link href={link.href} className="text-sm text-ink/80 transition-colors hover:text-accent">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line/60">
        <div className="container-page flex flex-col gap-3 py-5 text-[11px] text-muted/80 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} VELTRIX. Todos os direitos reservados.</p>
          <p className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Portugal · operações internacionais mediante configuração e validação legal
          </p>
        </div>
      </div>
    </footer>
  );
}
