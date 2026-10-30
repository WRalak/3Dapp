"use client";

import dynamic from "next/dynamic";
import type { GarmentKindName } from "@/types/catalog";

const ModelViewer = dynamic(() => import("@/components/showroom/model-viewer").then((m) => m.ModelViewer), { ssr: false, loading: () => <div className="skeleton absolute inset-0" /> });

export function AssetPreview(props: { url: string; hasDraco: boolean; hasKtx2: boolean; hasMeshopt: boolean; fileSize: number; name: string; kind: string }) {
  return <ModelViewer model={{ url: props.url, hasDraco: props.hasDraco, hasKtx2: props.hasKtx2, hasMeshopt: props.hasMeshopt, fileSize: props.fileSize }} garmentKind={props.kind as GarmentKindName} color="#8a8277" label={props.name} />;
}
