"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ShowroomItem } from "@/types/catalog";

// three.js is only fetched when the preview scrolls near the viewport.
const Showroom = dynamic(() => import("./showroom").then((m) => m.Showroom), {
  ssr: false,
  loading: () => <div className="skeleton h-[60vh] min-h-[420px] w-full" />,
});

export function ShowroomPreview({ items, currency }: { items: ShowroomItem[]; currency: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref}>{near ? <Showroom items={items} currency={currency} height="h-[60vh] min-h-[420px]" compact /> : <div className="skeleton h-[60vh] min-h-[420px] w-full" />}</div>;
}
