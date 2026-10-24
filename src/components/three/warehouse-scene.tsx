"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

export interface SceneZone {
  id: string;
  name: string;
  zoneType: string;
  capacityPallets: number;
  occupiedPallets: number;
  utilizationPct: number;
  status: string;
}

export type ViewMode = "operational" | "architectural";

export const ZONE_COLORS: Record<string, string> = {
  receiving: "#60a5fa",
  dispatch: "#b8f36a",
  storage: "#9bafc1",
  picking: "#fbbf24",
  returns: "#c084fc",
  cold: "#22d3ee",
  high_value: "#f472b6",
};

/** Layout slots keep the model physically coherent: no objects overlapping walls. */
const SLOTS: Record<string, [number, number, number, number][]> = {
  receiving: [[-20, 0, -11.5, 14]],
  dispatch: [[12, 0, -11.5, 12]],
  storage: [
    [-15, 0, 0, 10],
    [0, 0, 0, 10],
    [15, 0, 0, 10],
  ],
  picking: [[-15, 0, 10, 8]],
  returns: [[0, 0, 10, 6]],
  cold: [[15, 0, 10, 8]],
  high_value: [[24, 0, 6, 6]],
};

const FLOOR = { width: 62, depth: 34 };
const WALL_HEIGHT = 6;

/** Deterministic pseudo-random so box sizes are stable between renders. */
function rand(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export interface WarehouseSceneProps {
  zones: SceneZone[];
  mode: ViewMode;
  filter: string | null;
  selectedId: string | null;
  hoveredId: string | null;
  autoRotate: boolean;
  /** Increment to reset the camera to its initial pose. */
  resetSignal: number;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}

export function WarehouseScene({
  zones,
  mode,
  filter,
  selectedId,
  hoveredId,
  autoRotate,
  resetSignal,
  onSelect,
  onHover,
}: WarehouseSceneProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    controlsRef.current?.reset();
  }, [resetSignal]);

  const placed = useMemo(() => {
    const used = new Map<string, number>();
    return zones
      .filter((zone) => !filter || zone.zoneType === filter)
      .map((zone) => {
        const list = SLOTS[zone.zoneType] ?? SLOTS.storage!;
        const index = used.get(zone.zoneType) ?? 0;
        used.set(zone.zoneType, index + 1);
        const slot = list[index % list.length]!;
        return { zone, slot };
      });
  }, [zones, filter]);

  return (
    <Canvas
      dpr={[1, 1.75]}
      shadows
      camera={{ position: [36, 32, 36], fov: 42, near: 0.1, far: 280 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color("#081522");
        scene.fog = new THREE.Fog("#081522", 120, 240);
      }}
      onPointerMissed={() => onSelect(null)}
    >
      <ambientLight intensity={0.28} color="#9fc4e0" />
      <hemisphereLight args={["#cfe6ff", "#0a1622", 0.55]} />
      <directionalLight
        position={[30, 46, 24]}
        intensity={1.8}
        color="#f2fbff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={5}
        shadow-camera-far={150}
        shadow-bias={-0.00035}
      />
      <directionalLight position={[-30, 18, -22]} intensity={0.45} color="#7dd3fc" />

      <Ground />
      <FloorMarkings />
      <Building mode={mode} />
      <Roads />
      <Docks />
      <YardContainers />
      <LightPoles />

      {mode === "operational" ? <Traffic /> : null}
      {mode === "operational" ? <ParkedTrucks /> : null}
      {mode === "operational" ? <ForkliftPatrol /> : null}

      {placed.map(({ zone, slot }) => (
        <ZoneBlock
          key={zone.id}
          zone={zone}
          slot={slot}
          mode={mode}
          selected={selectedId === zone.id}
          hovered={hoveredId === zone.id}
          onSelect={() => onSelect(selectedId === zone.id ? null : zone.id)}
          onHover={onHover}
        />
      ))}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={18}
        maxDistance={130}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 0, 0]}
        autoRotate={autoRotate}
        autoRotateSpeed={0.7}
      />
    </Canvas>
  );
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[240, 190]} />
        <meshStandardMaterial color="#07121c" roughness={1} />
      </mesh>
      <gridHelper args={[240, 48, "#16324a", "#0d2335"]} position={[0, 0, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR.width, FLOOR.depth]} />
        <meshStandardMaterial color="#122233" roughness={0.92} metalness={0.05} />
      </mesh>
      {/* concrete apron around the building */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, -FLOOR.depth / 2 - 5.5]} receiveShadow>
        <planeGeometry args={[FLOOR.width + 6, 11]} />
        <meshStandardMaterial color="#0e2030" roughness={1} />
      </mesh>
    </>
  );
}

/** Painted safety markings: main aisle edges, dock staging dashes, pedestrian crossing. */
function FloorMarkings() {
  const aisle = [-4.1, -1.9];
  return (
    <group>
      {aisle.map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, z]}>
          <planeGeometry args={[FLOOR.width - 6, 0.14]} />
          <meshStandardMaterial color="#d8b13a" transparent opacity={0.55} roughness={0.9} />
        </mesh>
      ))}
      {Array.from({ length: 18 }).map((_, index) => (
        <mesh key={`dock-dash-${index}`} rotation={[-Math.PI / 2, 0, 0]} position={[-26 + index * 2.9, 0.015, -14.6]}>
          <planeGeometry args={[1.4, 0.14]} />
          <meshStandardMaterial color="#d8b13a" transparent opacity={0.5} roughness={0.9} />
        </mesh>
      ))}
      {Array.from({ length: 6 }).map((_, index) => (
        <mesh key={`cross-${index}`} rotation={[-Math.PI / 2, 0, 0]} position={[-1.75 + index * 0.7, 0.015, -3]}>
          <planeGeometry args={[0.36, 2]} />
          <meshStandardMaterial color="#cfe0ee" transparent opacity={0.35} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Building({ mode }: { mode: ViewMode }) {
  const walls: { position: [number, number, number]; size: [number, number, number] }[] = [
    { position: [0, WALL_HEIGHT / 2, -FLOOR.depth / 2], size: [FLOOR.width, WALL_HEIGHT, 0.4] },
    { position: [0, WALL_HEIGHT / 2, FLOOR.depth / 2], size: [FLOOR.width, WALL_HEIGHT, 0.4] },
    { position: [-FLOOR.width / 2, WALL_HEIGHT / 2, 0], size: [0.4, WALL_HEIGHT, FLOOR.depth] },
    { position: [FLOOR.width / 2, WALL_HEIGHT / 2, 0], size: [0.4, WALL_HEIGHT, FLOOR.depth] },
  ];

  return (
    <group>
      {walls.map((wall, index) => (
        <mesh key={index} position={wall.position}>
          <boxGeometry args={wall.size} />
          <meshStandardMaterial
            color={mode === "architectural" ? "#1b3145" : "#14293a"}
            transparent
            opacity={mode === "architectural" ? 0.85 : 0.16}
            roughness={0.8}
          />
        </mesh>
      ))}
      {mode === "architectural" ? (
        <group>
          <mesh position={[0, WALL_HEIGHT + 0.2, 0]}>
            <boxGeometry args={[FLOOR.width + 1, 0.35, FLOOR.depth + 1]} />
            <meshStandardMaterial color="#1f3a51" transparent opacity={0.55} roughness={0.9} />
          </mesh>
          {[-10, 0, 10].map((z) => (
            <mesh key={z} position={[0, WALL_HEIGHT + 0.42, z]}>
              <boxGeometry args={[FLOOR.width * 0.72, 0.08, 1.7]} />
              <meshStandardMaterial color="#7fb8e0" transparent opacity={0.5} emissive="#3d6a8c" emissiveIntensity={0.35} />
            </mesh>
          ))}
        </group>
      ) : null}
      {/* structural columns: part of the building, never inside aisles */}
      {[-24, -12, 0, 12, 24].map((x) =>
        [-12, 12].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, WALL_HEIGHT / 2, z]} castShadow>
            <boxGeometry args={[0.5, WALL_HEIGHT, 0.5]} />
            <meshStandardMaterial color="#24445e" roughness={0.7} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Roads() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 26]} receiveShadow>
        <planeGeometry args={[160, 10]} />
        <meshStandardMaterial color="#132a3d" roughness={1} />
      </mesh>
      {Array.from({ length: 15 }).map((_, index) => (
        <mesh key={index} rotation={[-Math.PI / 2, 0, 0]} position={[-67 + index * 9.5, 0.02, 26]}>
          <planeGeometry args={[4, 0.25]} />
          <meshStandardMaterial color="#3d6a8c" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-38, 0.01, 16]}>
        <planeGeometry args={[7, 22]} />
        <meshStandardMaterial color="#132a3d" roughness={1} />
      </mesh>
    </group>
  );
}

/** Dock doors with shelters, levelers, bollards and pulsing status signals. */
function Docks() {
  return (
    <group>
      {[-20, -14, 12, 18].map((x, index) => (
        <group key={x} position={[x, 0, -FLOOR.depth / 2 + 0.2]}>
          <mesh position={[0, 2.2, 0.2]}>
            <boxGeometry args={[4.6, 0.35, 1.4]} />
            <meshStandardMaterial color="#2f5570" roughness={0.7} />
          </mesh>
          <mesh position={[0, 3.6, 0.15]}>
            <boxGeometry args={[4.6, 2.4, 0.15]} />
            <meshStandardMaterial color="#0c1e2c" />
          </mesh>
          <mesh position={[0, 1.1, 1.1]}>
            <boxGeometry args={[4.2, 0.15, 1.6]} />
            <meshStandardMaterial color="#b8f36a" emissive="#4d7a1c" emissiveIntensity={0.4} />
          </mesh>
          {/* shelter bumpers */}
          {[-2.15, 2.15].map((offset) => (
            <mesh key={offset} position={[offset, 2.3, 0.55]} castShadow>
              <boxGeometry args={[0.32, 2.8, 0.55]} />
              <meshStandardMaterial color="#35536b" roughness={0.8} />
            </mesh>
          ))}
          <mesh position={[0, 3.95, 0.55]}>
            <boxGeometry args={[4.6, 0.4, 0.55]} />
            <meshStandardMaterial color="#35536b" roughness={0.8} />
          </mesh>
          {/* safety bollards */}
          {[-2.5, 2.5].map((offset) => (
            <mesh key={`bollard-${offset}`} position={[offset, 0.4, 1.9]}>
              <cylinderGeometry args={[0.09, 0.09, 0.8, 10]} />
              <meshStandardMaterial color="#eab308" roughness={0.6} />
            </mesh>
          ))}
          <PulsingBeacon position={[0, 4.45, 0.55]} color="#4ade80" speed={1.6 + index * 0.35} size={0.13} />
        </group>
      ))}
    </group>
  );
}

/** Emissive beacon whose intensity pulses over time (no real light source = cheap). */
function PulsingBeacon({
  position,
  color,
  speed = 5,
  size = 0.16,
}: {
  position: [number, number, number];
  color: string;
  speed?: number;
  size?: number;
}) {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    if (material.current) {
      material.current.emissiveIntensity = 0.7 + 0.6 * Math.sin(state.clock.elapsedTime * speed);
    }
  });
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 12, 12]} />
      <meshStandardMaterial ref={material} color={color} emissive={color} emissiveIntensity={1} roughness={0.4} />
    </mesh>
  );
}

function TruckBody({ cab = "#b8f36a", trailer = "#e6edf4" }: { cab?: string; trailer?: string }) {
  return (
    <group>
      <mesh position={[0, 1.9, 0]} castShadow>
        <boxGeometry args={[3.2, 2.9, 6.4]} />
        <meshStandardMaterial color={trailer} roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.5, 4.1]} castShadow>
        <boxGeometry args={[3, 2.3, 2]} />
        <meshStandardMaterial color={cab} roughness={0.45} metalness={0.15} />
      </mesh>
      <mesh position={[0, 2.05, 5.05]}>
        <boxGeometry args={[2.6, 0.8, 0.1]} />
        <meshStandardMaterial color="#0d1c28" roughness={0.3} metalness={0.4} />
      </mesh>
      {[-1.15, 1.15].map((wheelX) =>
        [-3.2, 3.4].map((wheelZ) => (
          <mesh key={`${wheelX}-${wheelZ}`} position={[wheelX, 0.5, wheelZ]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.5, 0.5, 0.34, 14]} />
            <meshStandardMaterial color="#0b1620" />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Trucks waiting at the receiving and dispatch docks. */
function ParkedTrucks() {
  return (
    <group>
      {[-20, 12].map((x, index) => (
        <group key={x} position={[x, 0, -FLOOR.depth / 2 - 4.5]} rotation={[0, index === 0 ? 0 : Math.PI, 0]}>
          <TruckBody cab={index === 0 ? "#b8f36a" : "#e8b04a"} />
        </group>
      ))}
    </group>
  );
}

/** Two trucks circulating on the access road, in opposite lanes. Purely decorative. */
function Traffic() {
  const east = useRef<THREE.Group>(null);
  const west = useRef<THREE.Group>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    if (east.current) east.current.position.x = ((time * 7 + 30) % 160) - 80;
    if (west.current) west.current.position.x = 80 - ((time * 5.5 + 10) % 160);
  });

  return (
    <group>
      <group ref={east} position={[0, 0, 23.3]} rotation={[0, Math.PI / 2, 0]}>
        <TruckBody />
        <PulsingBeacon position={[0, 2.9, 4.1]} color="#fbbf24" speed={7} size={0.11} />
      </group>
      <group ref={west} position={[0, 0, 28.6]} rotation={[0, -Math.PI / 2, 0]}>
        <TruckBody cab="#7dd3fc" trailer="#d3dce4" />
      </group>
    </group>
  );
}

/** Forklift patrolling the main aisle with smooth turnarounds and moving forks. Decorative. */
function ForkliftPatrol() {
  const group = useRef<THREE.Group>(null);
  const forks = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!group.current) return;
    const time = state.clock.elapsedTime;
    group.current.position.x = Math.sin(time * 0.3) * 21;
    group.current.position.y = 0.02 * Math.abs(Math.sin(time * 6));
    const heading = Math.cos(time * 0.3) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, heading, 3, delta);
    if (forks.current) {
      forks.current.position.y = 0.75 + 0.45 * (0.5 + 0.5 * Math.sin(time * 0.9));
    }
  });

  return (
    <group ref={group} position={[0, 0, -3]}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[1.3, 0.8, 2]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.7, -0.55]} castShadow>
        <boxGeometry args={[1.2, 1, 1]} />
        <meshStandardMaterial color="#1b2c3d" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.35, 1.2]}>
        <boxGeometry args={[0.16, 2.4, 0.16]} />
        <meshStandardMaterial color="#465c72" />
      </mesh>
      <group ref={forks} position={[0, 0.75, 0]}>
        {[-0.55, 0.55].map((x) => (
          <mesh key={x} position={[x, 0.4, 1.35]}>
            <boxGeometry args={[0.1, 0.08, 1]} />
            <meshStandardMaterial color="#465c72" />
          </mesh>
        ))}
      </group>
      <PulsingBeacon position={[0, 2.35, -0.55]} color="#fbbf24" speed={8} size={0.09} />
    </group>
  );
}

function YardContainers() {
  return (
    <group>
      <mesh position={[-44, 1.3, 8]} rotation={[0, 0.15, 0]} castShadow>
        <boxGeometry args={[6.1, 2.6, 2.5]} />
        <meshStandardMaterial color="#1d4ed8" roughness={0.75} />
      </mesh>
      <mesh position={[-44, 3.95, 8]} rotation={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[6.1, 2.6, 2.5]} />
        <meshStandardMaterial color="#9a3412" roughness={0.75} />
      </mesh>
      <mesh position={[-44, 1.3, 12]} rotation={[0, -0.06, 0]} castShadow>
        <boxGeometry args={[6.1, 2.6, 2.5]} />
        <meshStandardMaterial color="#166534" roughness={0.75} />
      </mesh>
    </group>
  );
}

function LightPoles() {
  return (
    <group>
      {[-32, 0, 32].map((x) => (
        <group key={x} position={[x, 0, 20.5]}>
          <mesh position={[0, 3.5, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.12, 7, 8]} />
            <meshStandardMaterial color="#35536b" roughness={0.7} />
          </mesh>
          <mesh position={[0, 7.05, 0.5]}>
            <boxGeometry args={[0.5, 0.18, 1]} />
            <meshStandardMaterial color="#cfe6ff" emissive="#9cc8e8" emissiveIntensity={0.9} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Frosted walls + glow strip for the cold-chain zone. */
function ColdShell({ size }: { size: number }) {
  const height = 3.1;
  const half = (size * 0.82) / 2;
  return (
    <group>
      {[
        { position: [0, height / 2, -half] as [number, number, number], dims: [size * 0.82, height, 0.12] as [number, number, number] },
        { position: [0, height / 2, half] as [number, number, number], dims: [size * 0.82, height, 0.12] as [number, number, number] },
        { position: [-half, height / 2, 0] as [number, number, number], dims: [0.12, height, size * 0.82] as [number, number, number] },
        { position: [half, height / 2, 0] as [number, number, number], dims: [0.12, height, size * 0.82] as [number, number, number] },
      ].map((wall, index) => (
        <mesh key={index} position={wall.position}>
          <boxGeometry args={wall.dims} />
          <meshStandardMaterial color="#67e8f9" transparent opacity={0.18} roughness={0.25} metalness={0.1} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <planeGeometry args={[size * 0.7, size * 0.6]} />
        <meshStandardMaterial color="#164e63" emissive="#0e7490" emissiveIntensity={0.4} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

/** Corner posts + top frame for the caged high-value zone. */
function SecurityCage({ size, color }: { size: number; color: string }) {
  const height = 2.6;
  const half = (size * 0.7) / 2;
  const corners: [number, number][] = [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ];
  return (
    <group>
      {corners.map(([cx, cz]) => (
        <mesh key={`${cx}-${cz}`} position={[cx, height / 2, cz]} castShadow>
          <boxGeometry args={[0.14, height, 0.14]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      {[-half, half].map((cz) => (
        <mesh key={`top-${cz}`} position={[0, height, cz]}>
          <boxGeometry args={[half * 2, 0.1, 0.12]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      {[-half, half].map((cx) => (
        <mesh key={`side-${cx}`} position={[cx, height, 0]}>
          <boxGeometry args={[0.12, 0.1, half * 2]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** One rack aisle row: upright posts + horizontal beams per level. */
function RackRow({ length, height, levels, z }: { length: number; height: number; levels: number; z: number }) {
  const posts = useMemo(() => {
    const count = Math.max(2, Math.round(length / 2.6));
    return Array.from({ length: count }, (_, index) => -length / 2 + (length / (count - 1)) * index);
  }, [length]);

  return (
    <group position={[0, 0, z]}>
      {posts.map((x) => (
        <mesh key={x} position={[x, height / 2, 0]} castShadow>
          <boxGeometry args={[0.14, height, 0.75]} />
          <meshStandardMaterial color="#46708f" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {Array.from({ length: levels }).map((_, level) => (
        <mesh key={level} position={[0, 0.7 + level * ((height - 1.2) / Math.max(1, levels - 1)), 0]} castShadow>
          <boxGeometry args={[length, 0.12, 0.78]} />
          <meshStandardMaterial color="#3a5b76" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function ZoneBlock({
  zone,
  slot,
  mode,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  zone: SceneZone;
  slot: [number, number, number, number];
  mode: ViewMode;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const [x, , z, size] = slot;
  const color = ZONE_COLORS[zone.zoneType] ?? "#9bafc1";
  const isRacked = zone.zoneType === "storage" || zone.zoneType === "picking";
  const groupRef = useRef<THREE.Group>(null);
  const edgeMaterial = useRef<THREE.LineBasicMaterial>(null);
  const baseMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const shelfMesh = useRef<THREE.InstancedMesh>(null);
  const palletBaseMesh = useRef<THREE.InstancedMesh>(null);
  const palletLoadMesh = useRef<THREE.InstancedMesh>(null);

  const rack = useMemo(() => {
    if (!isRacked) return null;
    const isStorage = zone.zoneType === "storage";
    const rows = isStorage ? 3 : 2;
    return {
      length: size * 0.82,
      height: isStorage ? 4.4 : 3,
      levels: isStorage ? 3 : 2,
      rowZ: Array.from({ length: rows }, (_, row) => -size * 0.3 + (row * (size * 0.6)) / (rows - 1)),
    };
  }, [isRacked, zone.zoneType, size]);

  /** Boxes placed on rack beams; the filled share follows the registered occupancy. */
  const shelfBoxes = useMemo(() => {
    if (!rack) return [] as { position: [number, number, number]; scale: [number, number, number] }[];
    const segments = Math.max(2, Math.floor(rack.length / 2.2));
    const cells: [number, number, number][] = [];
    for (const rz of rack.rowZ) {
      for (let segment = 0; segment < segments; segment += 1) {
        for (let level = 0; level < rack.levels; level += 1) {
          const px = -rack.length / 2 + (rack.length / segments) * (segment + 0.5);
          const beamY = 0.7 + level * ((rack.height - 1.2) / Math.max(1, rack.levels - 1));
          cells.push([px, beamY + 0.52, rz]);
        }
      }
    }
    const filled = Math.min(
      cells.length,
      Math.max(zone.occupiedPallets > 0 ? 1 : 0, Math.round((zone.utilizationPct / 100) * cells.length)),
    );
    return cells.slice(0, filled).map((position, index) => ({
      position,
      scale: [0.82 + rand(index * 3 + 1) * 0.22, 0.72 + rand(index * 7 + 2) * 0.3, 0.82 + rand(index * 5 + 3) * 0.2] as [
        number,
        number,
        number,
      ],
    }));
  }, [rack, zone.utilizationPct, zone.occupiedPallets]);

  /** Floor pallets for staging zones (receiving, dispatch, returns, cold, high-value). */
  const floorPallets = useMemo(() => {
    if (isRacked) return [] as [number, number][];
    const columns = Math.max(2, Math.round(size / 2.6));
    const rows = Math.max(2, Math.round((size * 0.78) / 2.4));
    const capacity = columns * rows;
    const count = Math.min(
      capacity,
      Math.max(zone.occupiedPallets > 0 ? 1 : 0, Math.round((zone.utilizationPct / 100) * capacity)),
    );
    return Array.from({ length: count }, (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const px = -size / 2 + 1.3 + column * ((size - 2.6) / Math.max(1, columns - 1));
      const pz = -size * 0.39 + 1.2 + row * ((size * 0.78 - 2.4) / Math.max(1, rows - 1));
      return [px, pz] as [number, number];
    });
  }, [isRacked, size, zone.utilizationPct, zone.occupiedPallets]);

  const outline = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(size, 0.02, size * 0.78)), [size]);
  useEffect(() => () => outline.dispose(), [outline]);

  useEffect(() => {
    if (shelfMesh.current && shelfBoxes.length > 0) {
      const matrix = new THREE.Matrix4();
      const rotation = new THREE.Quaternion();
      shelfBoxes.forEach((box, index) => {
        matrix.compose(
          new THREE.Vector3(box.position[0], box.position[1], box.position[2]),
          rotation,
          new THREE.Vector3(box.scale[0], box.scale[1], box.scale[2]),
        );
        shelfMesh.current!.setMatrixAt(index, matrix);
      });
      shelfMesh.current.instanceMatrix.needsUpdate = true;
    }
  }, [shelfBoxes]);

  useEffect(() => {
    const matrix = new THREE.Matrix4();
    if (palletBaseMesh.current && floorPallets.length > 0) {
      floorPallets.forEach(([px, pz], index) => {
        matrix.makeTranslation(px, 0.08, pz);
        palletBaseMesh.current!.setMatrixAt(index, matrix);
      });
      palletBaseMesh.current.instanceMatrix.needsUpdate = true;
    }
    if (palletLoadMesh.current && floorPallets.length > 0) {
      floorPallets.forEach(([px, pz], index) => {
        matrix.makeTranslation(px, 0.47, pz);
        palletLoadMesh.current!.setMatrixAt(index, matrix);
      });
      palletLoadMesh.current.instanceMatrix.needsUpdate = true;
    }
  }, [floorPallets]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const target = selected ? 1.05 : hovered ? 1.02 : 1;
    const current = groupRef.current.scale.x;
    const next = THREE.MathUtils.lerp(current, target, 0.12);
    groupRef.current.scale.set(next, 1, next);
    if (baseMaterial.current) {
      baseMaterial.current.opacity = selected ? 0.34 : hovered ? 0.26 : 0.16;
    }
    if (edgeMaterial.current) {
      edgeMaterial.current.opacity = selected ? 0.75 + 0.25 * Math.sin(state.clock.elapsedTime * 4) : hovered ? 0.9 : 0.55;
    }
  });

  const palletColor = mode === "architectural" ? "#5b7893" : "#c8a06a";
  const showFullBeacon = zone.status === "full";
  const showBusyBeacon = !showFullBeacon && zone.utilizationPct >= 85;

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, 0]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(zone.id);
        }}
        onPointerOut={() => onHover(null)}
      >
        <planeGeometry args={[size, size * 0.78]} />
        <meshStandardMaterial ref={baseMaterial} color={color} transparent opacity={0.16} roughness={0.9} />
      </mesh>
      <lineSegments geometry={outline} position={[0, 0.05, 0]}>
        <lineBasicMaterial ref={edgeMaterial} color={color} transparent opacity={0.55} />
      </lineSegments>

      {zone.zoneType === "cold" ? <ColdShell size={size} /> : null}
      {zone.zoneType === "high_value" ? <SecurityCage size={size} color={color} /> : null}

      {rack
        ? rack.rowZ.map((rz) => <RackRow key={rz} length={rack.length} height={rack.height} levels={rack.levels} z={rz} />)
        : null}

      {shelfBoxes.length > 0 ? (
        <instancedMesh
          ref={shelfMesh}
          args={[undefined, undefined, shelfBoxes.length]}
          castShadow
          frustumCulled={false}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            onHover(zone.id);
          }}
          onPointerOut={() => onHover(null)}
        >
          <boxGeometry args={[1.35, 0.9, 0.9]} />
          <meshStandardMaterial color={palletColor} roughness={0.85} />
        </instancedMesh>
      ) : null}

      {floorPallets.length > 0 ? (
        <group>
          <instancedMesh ref={palletBaseMesh} args={[undefined, undefined, floorPallets.length]} castShadow frustumCulled={false}>
            <boxGeometry args={[1.15, 0.14, 1.25]} />
            <meshStandardMaterial color={mode === "architectural" ? "#46617c" : "#8a6a44"} roughness={0.9} />
          </instancedMesh>
          <instancedMesh
            ref={palletLoadMesh}
            args={[undefined, undefined, floorPallets.length]}
            castShadow
            frustumCulled={false}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect();
            }}
            onPointerOver={(event) => {
              event.stopPropagation();
              onHover(zone.id);
            }}
            onPointerOut={() => onHover(null)}
          >
            <boxGeometry args={[1.02, 0.62, 1.1]} />
            <meshStandardMaterial color={palletColor} roughness={0.85} />
          </instancedMesh>
        </group>
      ) : null}

      {showFullBeacon || showBusyBeacon ? (
        <group>
          <mesh position={[0, 1.9, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 3.8, 8]} />
            <meshStandardMaterial color="#35536b" roughness={0.7} />
          </mesh>
          <PulsingBeacon
            position={[0, 3.9, 0]}
            color={showFullBeacon ? "#f87171" : "#fbbf24"}
            speed={showFullBeacon ? 6 : 3}
            size={0.2}
          />
        </group>
      ) : null}
    </group>
  );
}
