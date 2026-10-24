"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Loader2, Package, Truck } from "lucide-react";
import { Skeleton } from "@/components/ui";

const HeroScene = dynamic(() => import("./hero-scene").then((mod) => mod.HeroScene), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar visual 3D…
      </div>
    </div>
  ),
});

/**
 * Animated brand visual for the landing hero. Decorative only: the canvas is
 * pointer-transparent and the container is hidden from assistive technology —
 * the textual caption below it carries the meaning.
 */
export function HeroVisual({ height = 440 }: { height?: number }) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      setWebgl(Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl")));
    } catch {
      setWebgl(false);
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <div
      className="panel relative overflow-hidden"
      style={{ height }}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0a1826]/70 via-transparent to-bg/60" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />

      {webgl === null ? (
        <Skeleton className="h-full w-full rounded-none" />
      ) : webgl ? (
        <HeroScene animate={!reducedMotion} />
      ) : (
        <StaticFallback />
      )}

      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-line/60 bg-bg/80 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted backdrop-blur">
        <p className="font-medium text-ink/80">VELTRIX — rede operacional</p>
        <p>{reducedMotion ? "Visual estático (movimento reduzido)" : "Animação decorativa · sem dados operacionais"}</p>
      </div>
    </div>
  );
}

/** Static composition shown when WebGL is unavailable. */
function StaticFallback() {
  return (
    <div className="relative grid h-full place-items-center">
      <svg viewBox="0 0 320 240" className="w-full max-w-sm opacity-90" role="img" aria-label="Rede logística VELTRIX estilizada">
        <circle cx="160" cy="170" r="86" fill="none" stroke="#1c3a52" strokeWidth="1.5" />
        <circle cx="160" cy="170" r="86" fill="none" stroke="#9bafc1" strokeWidth="1" strokeDasharray="3 7" />
        <path d="M160 130 Q 215 55 268 118" fill="none" stroke="#7dd3fc" strokeOpacity="0.5" strokeWidth="1.5" />
        <circle cx="268" cy="118" r="7" fill="#b8f36a" />
        <circle cx="160" cy="170" r="10" fill="#b8f36a" opacity="0.9" />
        <circle cx="160" cy="170" r="20" fill="none" stroke="#b8f36a" strokeOpacity="0.4" />
      </svg>
      <div className="absolute bottom-6 flex items-center gap-4 text-accent/80">
        <Truck className="h-5 w-5" />
        <Package className="h-4 w-4 text-muted" />
      </div>
    </div>
  );
}
