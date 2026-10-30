"use client";

import dynamic from "next/dynamic";
import type { ShowroomItem } from "@/types/catalog";

const Showroom = dynamic(() => import("@/components/showroom/showroom").then((m) => m.Showroom), {
  ssr: false,
  loading: () => <div className="skeleton h-[calc(100dvh-16rem)] min-h-[480px] max-h-[900px] w-full" aria-label="Loading the showroom" />,
});

export function ShowroomClient(props: { items: ShowroomItem[]; currency: string; forceFallback?: boolean }) {
  return <Showroom {...props} />;
}
