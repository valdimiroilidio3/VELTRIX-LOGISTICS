"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { mergeBufferGeometries } from "three-stdlib";
import * as THREE from "three";
import { cachedTexture, brandDecalTexture } from "./textures";

/**
 * Realistic procedural tractor + box trailer, built as ~10 merged meshes
 * (one per material) instead of dozens of primitives — detailed enough to read
 * as a real truck, cheap enough to run several instances with shadows.
 *
 * Local space: front = +Z, ~8.8 units long, wheels at y 0.46.
 */

type Part = { size: [number, number, number]; pos: [number, number, number]; rotX?: number; rotY?: number };

function mergedBoxes(parts: Part[]): THREE.BufferGeometry {
  const list = parts.map(({ size, pos, rotX = 0, rotY = 0 }) => {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, rotY, 0));
    matrix.setPosition(pos[0], pos[1], pos[2]);
    geometry.applyMatrix4(matrix);
    return geometry;
  });
  const merged = mergeBufferGeometries(list, false);
  list.forEach((geometry) => geometry.dispose());
  return merged ?? new THREE.BufferGeometry();
}

type Cyl = { r: number; h: number; pos: [number, number, number]; alongX?: boolean; alongZ?: boolean };

function mergedCylinders(parts: Cyl[]): THREE.BufferGeometry {
  const list = parts.map(({ r, h, pos, alongX = false, alongZ = false }) => {
    const geometry = new THREE.CylinderGeometry(r, r, h, 16);
    if (alongX) geometry.rotateZ(Math.PI / 2);
    if (alongZ) geometry.rotateX(Math.PI / 2);
    geometry.translate(pos[0], pos[1], pos[2]);
    return geometry;
  });
  const merged = mergeBufferGeometries(list, false);
  list.forEach((geometry) => geometry.dispose());
  return merged ?? new THREE.BufferGeometry();
}

interface TruckGeometrySet {
  paint: THREE.BufferGeometry;
  trailer: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  dark: THREE.BufferGeometry;
  metal: THREE.BufferGeometry;
  lightsFront: THREE.BufferGeometry;
  lightsRear: THREE.BufferGeometry;
  decal: THREE.BufferGeometry;
  wheelsFront: THREE.BufferGeometry;
  wheelsRear: THREE.BufferGeometry;
}

const FRONT_AXLE: [number, number, number] = [0, 0.46, 3.3];
const REAR_AXLES: [number, number, number] = [0, 0.46, -2.9];

function buildTruck(lite: boolean): TruckGeometrySet {
  const paintBox: Part[] = [
    { size: [2.3, 1.75, 1.55], pos: [0, 1.28, 2.72] }, // cab shell
    { size: [2.26, 0.72, 1.2], pos: [0, 0.98, 3.9], rotX: 0.06 }, // hood
    { size: [2.3, 0.95, 0.3], pos: [0, 2.42, 1.98], rotX: -0.42 }, // roof deflector
    { size: [2.45, 0.16, 1.15], pos: [0, 1.2, -2.3] }, // rear mudguard 1
    { size: [2.45, 0.16, 1.15], pos: [0, 1.2, -3.5] }, // rear mudguard 2
  ];
  const trailerBox: Part[] = [
    { size: [2.55, 2.75, 6.9], pos: [0, 1.86, -1.15] },
    { size: [2.6, 0.12, 6.95], pos: [0, 3.28, -1.15] }, // roof edge
    { size: [1.24, 2.55, 0.09], pos: [-0.64, 1.86, -4.63] }, // rear door L
    { size: [1.24, 2.55, 0.09], pos: [0.64, 1.86, -4.63] }, // rear door R
    { size: [2.6, 0.12, 0.15], pos: [0, 0.55, -4.62] }, // rear frame bar
  ];
  const glassBox: Part[] = [
    { size: [1.95, 0.72, 0.07], pos: [0, 1.72, 3.5], rotX: -0.17 }, // windshield
    { size: [0.05, 0.6, 0.75], pos: [1.18, 1.72, 2.85] }, // window R
    { size: [0.05, 0.6, 0.75], pos: [-1.18, 1.72, 2.85] }, // window L
  ];
  const darkBox: Part[] = [
    { size: [1.5, 0.35, 8.2], pos: [0, 0.42, 0] }, // chassis
    { size: [2.4, 0.42, 0.22], pos: [0, 0.68, 4.44] }, // front bumper
    { size: [1.8, 0.62, 0.08], pos: [0, 1.15, 4.46] }, // grille
  ];
  const metalCyl: Cyl[] = [];
  const lightsFrontBox: Part[] = [
    { size: [0.5, 0.24, 0.06], pos: [-0.78, 0.92, 4.48] },
    { size: [0.5, 0.24, 0.06], pos: [0.78, 0.92, 4.48] },
  ];
  const lightsRearBox: Part[] = [{ size: [2.3, 0.16, 0.07], pos: [0, 0.72, -4.66] }];

  if (!lite) {
    darkBox.push(
      { size: [0.07, 0.34, 0.2], pos: [1.42, 1.95, 3.2], rotY: 0.25 }, // mirror R
      { size: [0.07, 0.34, 0.2], pos: [-1.42, 1.95, 3.2], rotY: -0.25 }, // mirror L
      { size: [0.55, 0.14, 0.45], pos: [1.25, 0.55, 2.3] }, // step R
      { size: [0.55, 0.14, 0.45], pos: [-1.25, 0.55, 2.3] }, // step L
      { size: [0.5, 0.5, 0.06], pos: [1.05, 0.35, -3.95] }, // mudflap R
      { size: [0.5, 0.5, 0.06], pos: [-1.05, 0.35, -3.95] }, // mudflap L
    );
    // corrugated ribs along both trailer sides
    for (let z = -4.35; z <= 2.05; z += 0.55) {
      trailerBox.push({ size: [0.05, 2.55, 0.12], pos: [1.3, 1.86, z] });
      trailerBox.push({ size: [0.05, 2.55, 0.12], pos: [-1.3, 1.86, z] });
    }
    metalCyl.push(
      { r: 0.34, h: 1.5, pos: [-0.95, 0.6, 0.9], alongZ: true }, // fuel tank
      { r: 0.08, h: 2.3, pos: [1.18, 1.8, 1.85] }, // exhaust stack
    );
  }

  const decal = (() => {
    const right = new THREE.PlaneGeometry(6.4, 1.35);
    right.rotateY(Math.PI / 2);
    right.translate(1.31, 2.1, -1.15);
    const left = new THREE.PlaneGeometry(6.4, 1.35);
    left.rotateY(-Math.PI / 2);
    left.translate(-1.31, 2.1, -1.15);
    const merged = mergeBufferGeometries([right, left], false);
    right.dispose();
    left.dispose();
    return merged ?? new THREE.BufferGeometry();
  })();

  const wheel = (x: number, z: number): Cyl[] => [
    { r: 0.46, h: 0.34, pos: [x, 0, z], alongX: true },
    { r: 0.22, h: 0.355, pos: [x, 0, z], alongX: true },
  ];

  return {
    paint: mergedBoxes(paintBox),
    trailer: mergedBoxes(trailerBox),
    glass: mergedBoxes(glassBox),
    dark: mergedBoxes(darkBox),
    metal: mergedCylinders(metalCyl),
    lightsFront: mergedBoxes(lightsFrontBox),
    lightsRear: mergedBoxes(lightsRearBox),
    decal,
    // wheel geometry origins sit on their axle pivot so rotation.x spins correctly
    wheelsFront: mergedCylinders(wheel(-1.12, 0).concat(wheel(1.12, 0))),
    wheelsRear: mergedCylinders(wheel(-1.12, -0.6).concat(wheel(1.12, -0.6), wheel(-1.12, 0.6), wheel(1.12, 0.6))),
  };
}

export interface ProcTruckProps {
  accent?: string;
  trailer?: string;
  /** spinning wheels; pass false for parked/static contexts */
  animate?: boolean;
  /** lite: fewer detail parts for distant/small renderings */
  lite?: boolean;
}

export function ProcTruck({ accent = "#b8f36a", trailer = "#e9eef4", animate = true, lite = false }: ProcTruckProps) {
  const frontWheels = useRef<THREE.Mesh>(null);
  const rearWheels = useRef<THREE.Mesh>(null);

  const geo = useMemo(() => buildTruck(lite), [lite]);
  const decalMap = useMemo(() => cachedTexture("brand-decal", () => brandDecalTexture()), []);

  useEffect(
    () => () => {
      Object.values(geo).forEach((geometry) => geometry.dispose());
    },
    [geo],
  );

  useFrame((_, delta) => {
    if (!animate) return;
    if (frontWheels.current) frontWheels.current.rotation.x -= delta * 6;
    if (rearWheels.current) rearWheels.current.rotation.x -= delta * 6;
  });

  return (
    <group>
      <mesh geometry={geo.paint} castShadow>
        <meshStandardMaterial color={accent} metalness={0.28} roughness={0.34} envMapIntensity={1} />
      </mesh>
      <mesh geometry={geo.trailer} castShadow>
        <meshStandardMaterial color={trailer} metalness={0.12} roughness={0.52} envMapIntensity={0.55} />
      </mesh>
      <mesh geometry={geo.glass}>
        <meshStandardMaterial color="#0b141d" metalness={0.85} roughness={0.08} envMapIntensity={1.6} />
      </mesh>
      <mesh geometry={geo.dark}>
        <meshStandardMaterial color="#141a21" metalness={0.1} roughness={0.85} />
      </mesh>
      <mesh geometry={geo.metal}>
        <meshStandardMaterial color="#9aa7b5" metalness={0.8} roughness={0.35} envMapIntensity={1.2} />
      </mesh>
      <mesh geometry={geo.lightsFront}>
        <meshStandardMaterial color="#fff3c4" emissive="#fde68a" emissiveIntensity={1.6} />
      </mesh>
      <mesh geometry={geo.lightsRear}>
        <meshStandardMaterial color="#f87171" emissive="#f87171" emissiveIntensity={1.2} />
      </mesh>
      <mesh geometry={geo.decal}>
        <meshBasicMaterial map={decalMap} transparent toneMapped={false} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh ref={frontWheels} geometry={geo.wheelsFront} position={FRONT_AXLE} castShadow>
        <meshStandardMaterial color="#15181d" roughness={0.92} />
      </mesh>
      <mesh ref={rearWheels} geometry={geo.wheelsRear} position={REAR_AXLES} castShadow>
        <meshStandardMaterial color="#15181d" roughness={0.92} />
      </mesh>
    </group>
  );
}
