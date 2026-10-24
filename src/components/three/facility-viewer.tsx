"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Boxes, Building2, Loader2, Maximize2, MousePointerClick, Orbit, RotateCcw } from "lucide-react";
import { Badge, Button, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ZONE_COLORS, type SceneZone } from "./warehouse-scene";

const WarehouseScene = dynamic(() => import("./warehouse-scene").then((mod) => mod.WarehouseScene), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar modelo 3D…
      </div>
    </div>
  ),
});

const FILTERS = [
  { value: null, label: "Todas as zonas" },
  { value: "receiving", label: "Receção" },
  { value: "dispatch", label: "Expedição" },
  { value: "storage", label: "Armazenagem" },
  { value: "picking", label: "Picking" },
  { value: "returns", label: "Devoluções" },
  { value: "cold", label: "Frio" },
  { value: "high_value", label: "Alto valor" },
];

export interface FacilityViewerProps {
  zones: SceneZone[];
  title?: string;
  height?: number;
  isDemo?: boolean;
}

export function FacilityViewer({ zones, height = 560, isDemo = true }: FacilityViewerProps) {
  const [mode, setMode] = useState<"operational" | "architectural">("operational");
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const supported = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
      setWebgl(supported);
    } catch {
      setWebgl(false);
    }
  }, []);

  const visibleZones = useMemo(() => (filter ? zones.filter((zone) => zone.zoneType === filter) : zones), [zones, filter]);
  const selectedZone = zones.find((zone) => zone.id === selected) ?? null;
  const hoveredZone = zones.find((zone) => zone.id === hovered) ?? null;
  const presentTypes = useMemo(() => Array.from(new Set(zones.map((zone) => zone.zoneType))), [zones]);

  const totalCapacity = zones.reduce((sum, zone) => sum + zone.capacityPallets, 0);
  const totalOccupied = zones.reduce((sum, zone) => sum + zone.occupiedPallets, 0);
  const utilization = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone={isDemo ? "warning" : "success"}>{isDemo ? "Demonstração" : "Dados operacionais"}</Badge>
          <span className="text-xs text-muted">
            {zones.length} zonas · {utilization}% de ocupação registada
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line/70 p-0.5" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              onClick={() => setMode("operational")}
              className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors", mode === "operational" ? "bg-surface-raised text-ink" : "text-muted hover:text-ink")}
              aria-pressed={mode === "operational"}
            >
              <Boxes className="h-3.5 w-3.5" /> Operacional
            </button>
            <button
              type="button"
              onClick={() => setMode("architectural")}
              className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors", mode === "architectural" ? "bg-surface-raised text-ink" : "text-muted hover:text-ink")}
              aria-pressed={mode === "architectural"}
            >
              <Building2 className="h-3.5 w-3.5" /> Arquitetura
            </button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setAutoRotate((value) => !value)} aria-pressed={autoRotate}>
            <Orbit className="h-3.5 w-3.5" /> {autoRotate ? "Parar órbita" : "Órbita"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setResetSignal((value) => value + 1)}>
            <RotateCcw className="h-3.5 w-3.5" /> Recentrar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setExpanded((value) => !value)} aria-pressed={expanded}>
            <Maximize2 className="h-3.5 w-3.5" /> {expanded ? "Reduzir" : "Expandir"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line/60 px-4 py-2">
        {FILTERS.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setFilter(option.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              filter === option.value ? "border-accent/40 bg-accent/10 text-accent" : "border-line/70 text-muted hover:text-ink",
            )}
            aria-pressed={filter === option.value}
          >
            {option.label}
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-line/70 sm:block" aria-hidden />
        <div className="flex flex-wrap items-center gap-2" aria-label="Legenda de cores por tipo de zona">
          {presentTypes.map((type) => (
            <span key={type} className="flex items-center gap-1 text-[10px] text-muted">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ZONE_COLORS[type] ?? "#9bafc1" }} aria-hidden />
              {labelForType(type)}
            </span>
          ))}
        </div>
      </div>

      <div className="relative" style={{ height: expanded ? Math.max(height, 720) : height, cursor: hovered ? "pointer" : "auto" }}>
        {webgl === null ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : webgl && zones.length > 0 ? (
          <WarehouseScene
            zones={zones}
            mode={mode}
            filter={filter}
            selectedId={selected}
            hoveredId={hovered}
            autoRotate={autoRotate}
            resetSignal={resetSignal}
            onSelect={setSelected}
            onHover={setHovered}
          />
        ) : (
          <FallbackPlan zones={visibleZones} reason={zones.length === 0 ? "Sem zonas registadas para representar." : "O seu dispositivo não suporta WebGL."} />
        )}

        <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-line/60 bg-bg/80 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted backdrop-blur">
          <p className="font-medium text-ink/80">{mode === "operational" ? "Vista operacional" : "Vista arquitetónica"}</p>
          <p>Arraste para orbitar · scroll para zoom</p>
        </div>

        {hoveredZone && !selectedZone ? (
          <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border border-line/60 bg-bg/80 px-2.5 py-1.5 text-[10px] text-muted backdrop-blur">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ZONE_COLORS[hoveredZone.zoneType] ?? "#9bafc1" }} aria-hidden />
            <span className="font-medium text-ink/80">{hoveredZone.name}</span>
            <span className="flex items-center gap-1 text-muted/80">
              <MousePointerClick className="h-3 w-3" /> clique para detalhes
            </span>
          </div>
        ) : null}

        {selectedZone ? (
          <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-line/70 bg-bg/92 p-3 backdrop-blur sm:right-auto sm:w-72">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-ink">{selectedZone.name}</p>
                <p className="text-[11px] text-muted">{labelForType(selectedZone.zoneType)}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-[11px] text-muted hover:text-ink" aria-label="Fechar detalhe da zona">
                Fechar
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-line/60 px-2 py-1.5">
                <p className="text-muted">Ocupação</p>
                <p className="font-semibold text-ink">
                  {selectedZone.occupiedPallets}/{selectedZone.capacityPallets} paletes
                </p>
              </div>
              <div className="rounded-lg border border-line/60 px-2 py-1.5">
                <p className="text-muted">Utilização</p>
                <p className={cn("font-semibold", selectedZone.utilizationPct > 85 ? "text-warning" : "text-ink")}>{selectedZone.utilizationPct}%</p>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={selectedZone.utilizationPct} aria-label={`Utilização de ${selectedZone.name}`}>
              <div
                className={cn("h-full rounded-full transition-all", selectedZone.utilizationPct > 85 ? "bg-warning" : "bg-accent")}
                style={{ width: `${Math.min(100, selectedZone.utilizationPct)}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted/80">
              Ocupação registada manualmente e auditada. Veículos e empilhador animados são decorativos; os objetos
              representam capacidade, não atividade em tempo real.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-4 py-2.5 text-[11px] text-muted">
        <p>Layout esquemático derivado das zonas do armazém. Não representa a planta certificada das instalações.</p>
        <p className="flex items-center gap-1">
          <RotateCcw className="h-3 w-3" /> Sombras suaves · instancing para paletes e caixas
        </p>
      </div>
    </div>
  );
}

function labelForType(type: string): string {
  return (
    {
      receiving: "Zona de receção",
      dispatch: "Zona de expedição",
      storage: "Armazenagem",
      picking: "Preparação de encomendas",
      returns: "Devoluções",
      cold: "Cadeia de frio",
      high_value: "Alto valor",
    }[type] ?? type
  );
}

/** Static accessible plan used when WebGL or zone data is unavailable. */
function FallbackPlan({ zones, reason }: { zones: SceneZone[]; reason: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <svg viewBox="0 0 520 260" className="w-full max-w-lg" role="img" aria-label="Planta esquemática do centro logístico">
        <rect x="10" y="10" width="500" height="240" rx="10" fill="#0d1f2f" stroke="#294054" />
        <rect x="40" y="30" width="80" height="40" fill="#60a5fa" opacity="0.25" stroke="#60a5fa" strokeOpacity="0.5" />
        <rect x="400" y="30" width="80" height="40" fill="#b8f36a" opacity="0.2" stroke="#b8f36a" strokeOpacity="0.5" />
        {[0, 1, 2].map((column) => (
          <rect key={column} x={60 + column * 130} y="100" width="110" height="70" fill="#9bafc1" opacity="0.15" stroke="#9bafc1" strokeOpacity="0.4" />
        ))}
        <text x="80" y="55" fontSize="10" fill="#dbe7f2" textAnchor="middle">
          Receção
        </text>
        <text x="440" y="55" fontSize="10" fill="#dbe7f2" textAnchor="middle">
          Expedição
        </text>
        <text x="260" y="200" fontSize="10" fill="#9bafc1" textAnchor="middle">
          {zones.length} zonas mapeadas
        </text>
      </svg>
      <p className="max-w-sm text-center text-xs text-muted">{reason} A planta estática mantém a informação de ocupação disponível na lista de zonas.</p>
    </div>
  );
}
