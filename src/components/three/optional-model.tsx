"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Clone, useGLTF } from "@react-three/drei";

/**
 * Drop-in pipeline for licensed GLB assets (see public/models/README.md).
 *
 * The scenes check whether the file exists before trying to parse it:
 * - missing file (the default) → the procedural fallback renders;
 * - file present in `public/models/` → the GLB is loaded and cloned per use.
 *
 * This keeps the build free of third-party assets whose licenses don't allow
 * redistribution, while letting the team drop in files they're entitled to.
 */

const MODEL_URLS = {
  /** 🚚 TRUCKS FICTION LOGISTICS COMPANY — Thcyrax (reference; not included) */
  trucks: "/models/trucks-fiction-logistics-company.glb",
  /** Logistics Center — mednik13 (reference; not included) */
  logisticsCenter: "/models/logistics-center.glb",
} as const;

export function modelUrl(key: keyof typeof MODEL_URLS): string {
  return MODEL_URLS[key];
}

/** HEAD-checks whether a model file is served. `null` while unknown. */
export function useModelAvailability(url: string): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(url, { method: "HEAD" })
      .then((response) => {
        if (alive) setAvailable(response.ok);
      })
      .catch(() => {
        if (alive) setAvailable(false);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  return available;
}

function GLTFClone({ url, ...props }: { url: string } & Record<string, unknown>) {
  const { scene } = useGLTF(url);
  return <Clone object={scene} {...props} />;
}

export interface OptionalModelProps {
  /** Model key in MODEL_URLS or a direct "/models/…" URL. */
  url: string;
  /** Procedural geometry rendered while the GLB is absent or loading. */
  fallback: ReactNode;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
}

export function OptionalModel({ url, fallback, ...props }: OptionalModelProps) {
  const available = useModelAvailability(url);

  if (available !== true) return <>{fallback}</>;

  return (
    <Suspense fallback={<>{fallback}</>}>
      <GLTFClone url={url} {...props} />
    </Suspense>
  );
}
