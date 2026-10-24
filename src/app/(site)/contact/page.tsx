import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MapPin, MessageSquare, ShieldAlert } from "lucide-react";
import { Panel } from "@/components/ui";
import { ContactForm } from "@/components/site/contact-form";

export const metadata: Metadata = {
  title: "Contactos",
  description: "Fale com a equipa VELTRIX sobre transporte, armazenagem, rastreio ou uma operação em preparação.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="container-page py-14 lg:py-20">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Contactos</p>
          <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">Falar com a equipa</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            Para pedidos com origem, destino e carga definidos, o formulário de orçamento é o caminho mais rápido.
            Para tudo o resto, use o formulário abaixo.
          </p>

          <div className="mt-8 space-y-3">
            <Panel className="flex items-start gap-3 p-4">
              <Mail className="mt-0.5 h-4 w-4 text-accent" aria-hidden />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  O endereço oficial será publicado no lançamento comercial. Até lá, os pedidos submetidos ficam
                  registados na plataforma e são visíveis à equipa operacional.
                </p>
              </div>
            </Panel>
            <Panel className="flex items-start gap-3 p-4">
              <MapPin className="mt-0.5 h-4 w-4 text-accent" aria-hidden />
              <div>
                <p className="text-sm font-medium">Localização</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  Portugal. As instalações operacionais e respetiva morada são confirmadas antes de qualquer divulgação
                  pública ou indicação em documentos de transporte.
                </p>
              </div>
            </Panel>
            <Panel className="flex items-start gap-3 p-4">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-warning" aria-hidden />
              <div>
                <p className="text-sm font-medium">Informação em validação</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  NIF, denominação social, contactos telefónicos e endereço de faturação estão sujeitos a validação
                  antes do lançamento. Não são apresentados dados que ainda não possam ser confirmados.
                </p>
              </div>
            </Panel>
          </div>
        </div>

        <div>
          <ContactForm />
          <Panel className="mt-4 p-5">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-accent" aria-hidden />
              <h2 className="text-sm font-semibold">Pedido de orçamento</h2>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Para uma estimativa imediata com base na tabela tarifária configurada, use o{" "}
              <Link href="/request-quote" className="text-accent underline underline-offset-2">
                formulário de orçamento
              </Link>
              . Para acompanhar uma encomenda, use o{" "}
              <Link href="/tracking" className="text-accent underline underline-offset-2">
                rastreio
              </Link>
              .
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
