/**
 * Procedural textures (canvas-generated at runtime; no network or asset files).
 * Used by the realistic models: corrugation for industrial panels, speckle for
 * asphalt/concrete, and the VELTRIX decal applied to trailer sides.
 * Results are cached module-wide so mode toggles never reallocate canvases.
 */
import * as THREE from "three";

const cache = new Map<string, THREE.CanvasTexture>();

export function cachedTexture(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let texture = cache.get(key);
  if (!texture) {
    texture = make();
    cache.set(key, texture);
  }
  return texture;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  return [canvas, ctx];
}

function finish(canvas: HTMLCanvasElement, repeat: [number, number]): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Vertical corrugated-sheet shading for industrial wall panels. */
export function corrugatedTexture(base = "#c3cedd", repeat: [number, number] = [20, 1]): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 64);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 64);
  for (let x = 0; x < 128; x += 8) {
    const gradient = ctx.createLinearGradient(x, 0, x + 8, 0);
    gradient.addColorStop(0, "rgba(0,0,0,0.16)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.10)");
    gradient.addColorStop(1, "rgba(0,0,0,0.10)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, 8, 64);
  }
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  ctx.fillRect(0, 0, 128, 4);
  return finish(canvas, repeat);
}

/** Speckled dark asphalt for the access road. */
export function asphaltTexture(repeat: [number, number] = [14, 1]): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = "#16232f";
  ctx.fillRect(0, 0, 128, 128);
  let seed = 42;
  const pseudo = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let index = 0; index < 900; index += 1) {
    const shade = 18 + Math.floor(pseudo() * 30);
    ctx.fillStyle = `rgb(${shade},${shade + 6},${shade + 11})`;
    ctx.fillRect(Math.floor(pseudo() * 128), Math.floor(pseudo() * 128), 1, 1);
  }
  return finish(canvas, repeat);
}

/** Pale concrete for the dock apron. */
export function concreteTexture(repeat: [number, number] = [6, 1]): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = "#232d38";
  ctx.fillRect(0, 0, 128, 128);
  let seed = 7;
  const pseudo = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let index = 0; index < 500; index += 1) {
    const shade = 30 + Math.floor(pseudo() * 22);
    ctx.fillStyle = `rgb(${shade},${shade + 5},${shade + 9})`;
    ctx.fillRect(Math.floor(pseudo() * 128), Math.floor(pseudo() * 128), 2, 2);
  }
  return finish(canvas, repeat);
}

/** VELTRIX side branding for the trailer (lettering + brand bar). */
export function brandDecalTexture(text = "VELTRIX LOGISTICS"): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 256);
  ctx.clearRect(0, 0, 1024, 256);
  ctx.font = "700 96px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#122233";
  ctx.fillText(text, 40, 118);
  ctx.fillStyle = "#8fc94e";
  ctx.fillRect(40, 180, 620, 14);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
