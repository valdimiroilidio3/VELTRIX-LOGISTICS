import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "VELTRIX — Logistics & Technology",
    template: "%s · VELTRIX",
  },
  description:
    "VELTRIX coordena encomendas, transportes, distribuição e armazenagem numa plataforma operacional com rastreio, prova de entrega e controlo por função.",
  applicationName: "VELTRIX",
  keywords: ["logística", "transportes", "rastreio de encomendas", "gestão de frotas", "armazém", "VELTRIX"],
  authors: [{ name: "VELTRIX" }],
  openGraph: {
    type: "website",
    locale: "pt_PT",
    siteName: "VELTRIX",
    title: "VELTRIX — Moving business forward.",
    description:
      "Plataforma de logística e gestão de transportes: encomendas, rotas, frota, armazém, rastreio e prova de entrega.",
  },
  twitter: { card: "summary_large_image", title: "VELTRIX — Logistics & Technology" },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/brand/favicon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#081522",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className="[--font-sans:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif] [--font-display:'Iowan_Old_Style','Palatino_Linotype',Georgia,serif]">
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-foreground"
        >
          Saltar para o conteúdo
        </a>
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: { background: "#102234", border: "1px solid #294054", color: "#F5F8FC" },
          }}
        />
      </body>
    </html>
  );
}
