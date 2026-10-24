"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";

/** Brand palette aligned with tailwind tokens. */
const ACCENT = "#b8f36a";
const SKY = "#7dd3fc";
const SLATE = "#9bafc1";
const ROAD = 3.1;

export interface HeroSceneProps {
  /** false when the user prefers reduced motion: everything renders frozen. */
  animate: boolean;
}

/**
 * Decorative brand animation for the public landing hero: a delivery truck
 * circling a glowing depot, parcels of light travelling a route arc, floating
 * crates and ambient particles. It carries no data and intercepts no input.
 */
export function HeroScene({ animate }: HeroSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [7.4, 5.2, 7.4], fov: 38, near: 0.1, far: 80 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <ambientLight intensity={0.4} color="#b9d4ea" />
      <directionalLight position={[6, 10, 4]} intensity={1.35} color="#f2fbff" />
      <directionalLight position={[-6, 4, -5]} intensity={0.35} color={SKY} />
      <SceneContents animate={animate} />
    </Canvas>
  );
}

function SceneContents({ animate }: { animate: boolean }) {
  const spin = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!animate || !spin.current) return;
    spin.current.rotation.y += delta * 0.05;
  });

  return (
    <group>
      <Ground />
      <group ref={spin}>
        <Depot animate={animate} />
        <TruckLoop animate={animate} />
        <RouteArc animate={animate} />
        <FloatingCrates animate={animate} />
      </group>
      <Sparkles
        count={90}
        scale={[15, 7.5, 15]}
        size={2}
        speed={animate ? 0.35 : 0}
        opacity={0.5}
        color={SKY}
        position={[0, 3.4, 0]}
      />
    </group>
  );
}

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[6.4, 64]} />
        <meshStandardMaterial color="#0a1622" roughness={1} />
      </mesh>
      <polarGridHelper args={[6.4, 12, 5, 64, "#1c3a52", "#12293c"]} position={[0, 0.005, 0]} />
    </group>
  );
}

/** Central depot: crate stack, beacon and a radar ping expanding on the floor. */
function Depot({ animate }: { animate: boolean }) {
  const ping = useRef<THREE.Mesh>(null);
  const pingMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const beacon = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    if (!animate) return;
    const cycle = (state.clock.elapsedTime % 2.6) / 2.6;
    if (ping.current) ping.current.scale.setScalar(0.5 + cycle * 2.4);
    if (pingMaterial.current) pingMaterial.current.opacity = (1 - cycle) * 0.55;
    if (beacon.current) beacon.current.emissiveIntensity = 0.9 + 0.5 * Math.sin(state.clock.elapsedTime * 3);
  });

  return (
    <group>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.75, 0.85, 0.12, 32]} />
        <meshStandardMaterial color="#14293a" roughness={0.8} />
      </mesh>
      <mesh position={[-0.22, 0.42, 0.1]}>
        <boxGeometry args={[0.52, 0.6, 0.52]} />
        <meshStandardMaterial color={ACCENT} roughness={0.5} />
      </mesh>
      <mesh position={[0.3, 0.36, -0.18]}>
        <boxGeometry args={[0.5, 0.48, 0.5]} />
        <meshStandardMaterial color={SLATE} roughness={0.7} />
      </mesh>
      <mesh position={[0.05, 0.85, 0.28]}>
        <boxGeometry args={[0.4, 0.34, 0.4]} />
        <meshStandardMaterial color="#c8a06a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1.1, 8]} />
        <meshStandardMaterial color="#35536b" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial ref={beacon} color={ACCENT} emissive={ACCENT} emissiveIntensity={1.2} roughness={0.3} />
      </mesh>
      <mesh ref={ping} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.85, 1, 64]} />
        <meshBasicMaterial ref={pingMaterial} color={ACCENT} transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Loop road ring + the truck driving it, heading along the tangent. */
function TruckLoop({ animate }: { animate: boolean }) {
  const truck = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!animate || !truck.current) return;
    const t = state.clock.elapsedTime * 0.28;
    truck.current.position.set(Math.cos(t) * ROAD, 0, Math.sin(t) * ROAD);
    truck.current.rotation.y = -t;
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[ROAD - 0.36, ROAD + 0.36, 96]} />
        <meshStandardMaterial color="#14293a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[ROAD - 0.015, ROAD + 0.015, 96]} />
        <meshBasicMaterial color={SLATE} transparent opacity={0.45} />
      </mesh>
      <group ref={truck} position={[ROAD, 0, 0]}>
        <MiniTruck animate={animate} />
      </group>
    </group>
  );
}

function MiniTruck({ animate }: { animate: boolean }) {
  const wheels = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!animate || !wheels.current) return;
    wheels.current.children.forEach((wheel) => {
      wheel.rotation.x += delta * 6;
    });
  });

  return (
    <group scale={0.6}>
      <mesh position={[0, 0.75, -0.25]}>
        <boxGeometry args={[1.1, 0.95, 2.1]} />
        <meshStandardMaterial color="#e6edf4" roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.62, 1.15]}>
        <boxGeometry args={[1.05, 0.72, 0.75]} />
        <meshStandardMaterial color={ACCENT} roughness={0.45} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.78, 1.53]}>
        <boxGeometry args={[0.9, 0.3, 0.06]} />
        <meshStandardMaterial color="#0d1c28" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* headlight and tail-light strips */}
      <mesh position={[0, 0.36, 1.55]}>
        <boxGeometry args={[0.85, 0.09, 0.05]} />
        <meshStandardMaterial color="#fef9c3" emissive="#fde68a" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, 0.45, -1.32]}>
        <boxGeometry args={[0.85, 0.09, 0.05]} />
        <meshStandardMaterial color="#f87171" emissive="#f87171" emissiveIntensity={1.1} />
      </mesh>
      <group ref={wheels}>
        {[
          [-0.58, 1.05],
          [0.58, 1.05],
          [-0.58, -0.85],
          [0.58, -0.85],
        ].map(([wheelX, wheelZ]) => (
          <mesh key={`${wheelX}-${wheelZ}`} position={[wheelX ?? 0, 0.24, wheelZ ?? 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.24, 0.24, 0.16, 12]} />
            <meshStandardMaterial color="#0b1620" roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Elevated route arc depot→destination with light parcels travelling along it. */
function RouteArc({ animate }: { animate: boolean }) {
  const packets = useRef<(THREE.Mesh | null)[]>([]);

  const curve = useMemo(
    () =>
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 1.3, 0),
        new THREE.Vector3(2.1, 4.4, -1.6),
        new THREE.Vector3(4.7, 1.35, -2.3),
      ),
    [],
  );

  useFrame((state) => {
    if (!animate) return;
    packets.current.forEach((packet, index) => {
      if (!packet) return;
      const t = (state.clock.elapsedTime * 0.12 + index / 3) % 1;
      const point = curve.getPointAt(t);
      packet.position.copy(point);
      const scale = 0.75 + 0.45 * Math.sin(t * Math.PI);
      packet.scale.setScalar(scale);
    });
  });

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 48, 0.022, 8, false]} />
        <meshBasicMaterial color={SKY} transparent opacity={0.32} />
      </mesh>
      {[0, 1, 2].map((index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            packets.current[index] = mesh;
          }}
          position={curve.getPointAt(index / 3)}
        >
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={1.6} roughness={0.3} />
        </mesh>
      ))}
      {/* destination marker */}
      <group position={[4.7, 0, -2.3]}>
        <mesh position={[0, 0.9, 0]}>
          <octahedronGeometry args={[0.3]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.9} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.8, 8]} />
          <meshStandardMaterial color="#35536b" roughness={0.7} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.45, 0.6, 48]} />
          <meshBasicMaterial color={SKY} transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

const CRATES: { position: [number, number, number]; phase: number; color: string }[] = [
  { position: [-3.6, 1.7, -1.6], phase: 0.4, color: SLATE },
  { position: [-2.7, 2.5, 1.7], phase: 1.7, color: "#c8a06a" },
  { position: [2.6, 2.2, 2.4], phase: 2.9, color: SLATE },
  { position: [3.8, 1.5, 0.7], phase: 4.1, color: ACCENT },
  { position: [-1.4, 3, -3], phase: 5.3, color: "#c8a06a" },
  { position: [1.8, 3.1, 1.2], phase: 3.4, color: SLATE },
];

function FloatingCrates({ animate }: { animate: boolean }) {
  return (
    <group>
      {CRATES.map((crate) => (
        <FloatCrate key={crate.phase} {...crate} animate={animate} />
      ))}
    </group>
  );
}

function FloatCrate({
  position,
  phase,
  color,
  animate,
}: {
  position: [number, number, number];
  phase: number;
  color: string;
  animate: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!animate || !mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.position.y = position[1] + 0.2 * Math.sin(t * 0.8 + phase);
    mesh.current.rotation.y = t * 0.14 + phase;
    mesh.current.rotation.x = 0.08 * Math.sin(t * 0.5 + phase);
  });

  return (
    <mesh ref={mesh} position={position}>
      <boxGeometry args={[0.42, 0.42, 0.42]} />
      <meshStandardMaterial color={color} roughness={0.65} emissive={color} emissiveIntensity={0.08} />
    </mesh>
  );
}
