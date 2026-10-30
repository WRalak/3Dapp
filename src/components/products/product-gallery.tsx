"use client";

import { useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Box, ZoomIn } from "lucide-react";
import { isSvgSource } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { Model3DData, ProductImageData, GarmentKindName } from "@/types/catalog";

// The 3D viewer (three.js) is code-split and only downloaded when the shopper opens it.
const ModelViewer = dynamic(() => import("@/components/showroom/model-viewer").then((m) => m.ModelViewer), {
  ssr: false,
  loading: () => <div className="skeleton absolute inset-0" />,
});

const KIND_LABEL: Record<ProductImageData["kind"], string> = { GALLERY: "", FRONT: "Front", BACK: "Back", SIDE: "Side", FABRIC_DETAIL: "Fabric detail" };

export function ProductGallery({
  images,
  name,
  model,
  garmentKind,
  color,
}: {
  images: ProductImageData[];
  name: string;
  model: Model3DData | null;
  garmentKind: GarmentKindName;
  color: string;
}) {
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<"image" | "3d">("image");
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const current = images[active];

  return (
    <div className="lg:sticky lg:top-24">
      <div className="relative aspect-[3/4] overflow-hidden bg-bone">
        {mode === "3d" ? (
          <ModelViewer model={model} garmentKind={garmentKind} color={color} label={name} />
        ) : current ? (
          <div
            className="relative h-full w-full cursor-zoom-in"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
            onMouseLeave={() => setZoom(null)}
          >
            <Image
              src={current.url}
              alt={current.alt}
              fill
              priority
              unoptimized={isSvgSource(current.url)}
              sizes="(min-width:1024px) 50vw, 100vw"
              className="object-cover transition-transform duration-300"
              style={zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            />
            {KIND_LABEL[current.kind] && <span className="eyebrow absolute bottom-4 left-4 bg-ivory/90 px-2 py-1">{KIND_LABEL[current.kind]}</span>}
            <ZoomIn className="absolute right-4 top-4 size-4 text-ink/50" aria-hidden />
          </div>
        ) : null}

        <div className="absolute bottom-4 right-4 flex border bg-ivory/95 text-xs" role="tablist" aria-label="View mode">
          <button role="tab" aria-selected={mode === "image"} onClick={() => setMode("image")} className={cn("px-3 py-2", mode === "image" && "bg-ink text-ivory")}>
            Photos
          </button>
          <button role="tab" aria-selected={mode === "3d"} onClick={() => setMode("3d")} className={cn("inline-flex items-center gap-1.5 px-3 py-2", mode === "3d" && "bg-ink text-ivory")}>
            <Box className="size-3.5" aria-hidden /> 3D view
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2" role="list" aria-label="Product images">
        {images.map((img, i) => (
          <button
            key={img.id}
            role="listitem"
            onClick={() => {
              setActive(i);
              setMode("image");
            }}
            className={cn("relative aspect-[3/4] overflow-hidden bg-bone outline-offset-2", i === active && mode === "image" && "outline outline-1 outline-ink")}
            aria-label={`Show image ${i + 1}: ${img.alt}`}
          >
            <Image src={img.url} alt="" fill sizes="120px" unoptimized={isSvgSource(img.url)} className="object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
