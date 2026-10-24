"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Eraser, Loader2, MapPin, PenLine, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { podAction } from "@/app/app/actions";
import { Button, Field, Input, Notice } from "@/components/ui";

/** Canvas signature pad. Explicitly NOT a qualified electronic signature. */
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function position(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    drawing.current = true;
    const { x, y } = position(event);
    context.beginPath();
    context.moveTo(x, y);
    canvas.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = position(event);
    context.lineTo(x, y);
    context.strokeStyle = "#0B1A0E";
    context.lineWidth = 2;
    context.lineCap = "round";
    context.stroke();
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={520}
        height={160}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-[140px] w-full touch-none rounded-xl border border-line bg-[#F7FAFC]"
        aria-label="Área de assinatura"
        role="img"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <p className="text-[10px] text-muted">Assinatura simples recolhida no ecrã — não é assinatura eletrónica qualificada.</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            const canvas = canvasRef.current;
            const context = canvas?.getContext("2d");
            if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
            onChange(null);
          }}
        >
          <Eraser className="h-3.5 w-3.5" /> Limpar
        </Button>
      </div>
    </div>
  );
}

async function fileToCompressedDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler o ficheiro"));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Imagem inválida"));
    element.src = dataUrl;
  });

  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function PodPanel({ shipmentId, disabled }: { shipmentId: string; disabled: boolean }) {
  const router = useRouter();
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function requestLocation() {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Este dispositivo não suporta geolocalização.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => setCoords({ lat: Number(position.coords.latitude.toFixed(6)), lng: Number(position.coords.longitude.toFixed(6)) }),
      () => setGeoError("Permissão de localização recusada. A entrega pode ser registada sem coordenadas."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  }

  async function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 3);
    try {
      const encoded = await Promise.all(files.map(fileToCompressedDataUrl));
      setPhotos((current) => [...current, ...encoded].slice(0, 4));
    } catch {
      setError("Não foi possível processar a imagem.");
    }
  }

  function submit() {
    setError(null);
    if (receivedBy.trim().length < 2) {
      setError("Indique quem recebeu a encomenda.");
      return;
    }
    startTransition(async () => {
      const result = await podAction({
        shipmentId,
        receivedBy,
        notes: notes || undefined,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        signatureDataUrl: signature ?? undefined,
        photos,
      });
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  if (disabled) {
    return (
      <div className="flex items-center gap-2 px-5 py-4 text-xs text-success">
        <CheckCircle2 className="h-4 w-4" /> Entrega já confirmada com prova registada.
      </div>
    );
  }

  return (
    <div className="space-y-3 px-5 py-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Recebido por" htmlFor="pod-received">
          <Input id="pod-received" value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)} placeholder="Nome de quem recebeu" />
        </Field>
        <Field label="Notas (opcional)" htmlFor="pod-notes">
          <Input id="pod-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: entregue na portaria" />
        </Field>
      </div>

      <div>
        <p className="label flex items-center gap-1.5">
          <PenLine className="h-3 w-3" /> Assinatura
        </p>
        <SignaturePad onChange={setSignature} />
      </div>

      <div>
        <p className="label flex items-center gap-1.5">
          <Camera className="h-3 w-3" /> Fotografias ({photos.length}/4)
        </p>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          multiple
          onChange={onFiles}
          className="block w-full cursor-pointer rounded-xl border border-line bg-bg/60 px-3 py-2 text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-raised file:px-2.5 file:py-1.5 file:text-xs file:text-ink"
        />
        {photos.length > 0 ? <p className="mt-1 text-[10px] text-success">{photos.length} imagem(ns) pronta(s) a enviar (comprimidas no dispositivo).</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={requestLocation}>
          <MapPin className="h-3.5 w-3.5" /> {coords ? `${coords.lat}, ${coords.lng}` : "Registar localização"}
        </Button>
        {geoError ? <span className="text-[10px] text-warning">{geoError}</span> : null}
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl border border-line/60 bg-bg/40 px-3 py-2">
        <p className="text-[10px] leading-relaxed text-muted">
          Ao confirmar, a encomenda passa a <strong className="text-ink">entregue</strong>, o evento é registado e a
          faturação pode ser emitida.
        </p>
        <Button onClick={submit} disabled={pending} size="sm">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Confirmar entrega
        </Button>
      </div>
    </div>
  );
}
