"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  PackageSearch,
  Plug,
  Receipt,
  Route as RouteIcon,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { Button, DemoTag } from "@/components/ui";
import { cn, initials } from "@/lib/utils";
import type { Permission, Role } from "@/lib/auth/rbac";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: Permission;
  badge?: string;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operação",
    items: [
      { href: "/app", label: "Painel", icon: LayoutDashboard, permission: "dashboard:read" },
      { href: "/app/shipments", label: "Encomendas", icon: PackageSearch, permission: "shipments:read" },
      { href: "/app/routes", label: "Rotas", icon: RouteIcon, permission: "routes:read" },
      { href: "/app/driver", label: "As minhas tarefas", icon: Truck, permission: "tasks:read_own" },
    ],
  },
  {
    title: "Recursos",
    items: [
      { href: "/app/warehouse", label: "Armazém", icon: Warehouse, permission: "warehouse:read" },
      { href: "/app/facility", label: "Centro 3D", icon: Boxes, permission: "warehouse:read" },
      { href: "/app/fleet", label: "Frota e motoristas", icon: Truck, permission: "fleet:read" },
      { href: "/app/customers", label: "Clientes", icon: Users, permission: "customers:read" },
    ],
  },
  {
    title: "Comercial",
    items: [
      { href: "/app/quotes", label: "Orçamentos", icon: ClipboardList, permission: "quotes:read" },
      { href: "/app/invoices", label: "Faturação", icon: Receipt, permission: "invoices:read" },
      { href: "/app/messages", label: "Mensagens", icon: Mail, permission: "customers:read" },
    ],
  },
  {
    title: "Governação",
    items: [
      { href: "/app/analytics", label: "Relatórios", icon: BarChart3, permission: "analytics:read" },
      { href: "/app/users", label: "Utilizadores", icon: ShieldCheck, permission: "users:manage" },
      { href: "/app/integrations", label: "Integrações", icon: Plug, permission: "settings:read" },
      { href: "/app/audit", label: "Auditoria", icon: FileText, permission: "audit:read" },
      { href: "/app/settings", label: "Configuração", icon: Settings, permission: "settings:read" },
    ],
  },
];

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const permissions = new Set(user.permissions);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => permissions.has(item.permission)),
  })).filter((group) => group.items.length > 0);

  const current = groups.flatMap((group) => group.items).find((item) =>
    item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href),
  );

  return (
    <div className="min-h-dvh bg-bg">
      {/* sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[264px] border-r border-line/70 bg-[#091b2a] transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Navegação da plataforma"
      >
        <div className="flex h-16 items-center justify-between border-b border-line/70 px-4">
          <Link href="/app" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-black text-accent-foreground">V</span>
            <span className="text-sm font-semibold tracking-[0.2em]">VELTRIX</span>
          </Link>
          <button type="button" onClick={() => setOpen(false)} className="text-muted lg:hidden" aria-label="Fechar menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex h-[calc(100dvh-4rem)] flex-col overflow-y-auto px-3 pb-4 pt-3">
          {groups.map((group) => (
            <div key={group.title} className="mb-4">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/60">{group.title}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                          active
                            ? "bg-accent/10 font-medium text-accent"
                            : "text-muted hover:bg-surface/70 hover:text-ink",
                        )}
                      >
                        <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-muted/80")} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="mt-auto space-y-2 pt-4">
            <div className="rounded-xl border border-line/60 bg-bg/50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted/60">Organização</p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink">
                <Building2 className="h-3 w-3 shrink-0 text-muted" /> {user.organizationName}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted">
                <ShieldCheck className="h-3 w-3" /> {ROLE_LABELS[user.role as Role] ?? user.role}
                {user.organizationDataMode === "demo" ? <DemoTag /> : null}
              </p>
            </div>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2">
                <LogOut className="h-3.5 w-3.5" /> Terminar sessão
              </Button>
            </form>
          </div>
        </nav>
      </aside>

      {open ? <button type="button" className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu" /> : null}

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line/70 bg-bg/85 px-4 backdrop-blur-xl sm:px-6">
          <button type="button" onClick={() => setOpen(true)} className="text-muted lg:hidden" aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted/70">
              {current?.label ?? "Plataforma"}
            </p>
            <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
          </div>

          <form action="/app/shipments" className="hidden max-w-xs flex-1 items-center md:flex" role="search">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                name="q"
                placeholder="Pesquisar encomenda, cliente…"
                aria-label="Pesquisa global"
                className="h-9 w-full rounded-lg border border-line/70 bg-surface/60 pl-9 pr-3 text-xs text-ink placeholder:text-muted/60 focus:border-accent/50 focus:outline-none"
              />
            </div>
          </form>

          <div className="flex items-center gap-2">
            <Link href="/" className="hidden rounded-lg border border-line/70 px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:text-ink sm:block">
              Site
            </Link>
            <div className="flex items-center gap-2 rounded-lg border border-line/70 bg-surface/60 py-1 pl-1 pr-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-[11px] font-semibold text-accent">
                {initials(user.fullName)}
              </span>
              <span className="hidden max-w-[120px] truncate text-[11px] text-muted sm:block">{user.email}</span>
              <ChevronDown className="hidden h-3 w-3 text-muted sm:block" aria-hidden />
            </div>
          </div>
        </header>

        {user.organizationDataMode === "demo" ? (
          <div className="border-b border-warning/20 bg-warning/5 px-4 py-1.5 text-center text-[10px] text-warning/90 sm:px-6">
            Ambiente de demonstração — todos os clientes, encomendas e indicadores são fictícios e não representam
            atividade comercial real.
          </div>
        ) : null}

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
