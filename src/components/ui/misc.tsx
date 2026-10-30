import * as React from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

const badgeTones = {
  neutral: "bg-bone text-graphite",
  ink: "bg-ink text-ivory",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  outline: "border border-border text-graphite",
} as const;

export function Badge({ tone = "neutral", className, children }: { tone?: keyof typeof badgeTones; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]", badgeTones[tone], className)}>{children}</span>;
}

export function Price({ cents, compareAt, currency = "USD", className }: { cents: number; compareAt?: number | null; currency?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-2 tabular-nums", className)}>
      <span className={cn(compareAt ? "text-clay" : undefined)}>{formatMoney(cents, currency)}</span>
      {compareAt ? (
        <span className="text-taupe line-through">
          <span className="sr-only">was </span>
          {formatMoney(compareAt, currency)}
        </span>
      ) : null}
    </span>
  );
}

export function Rating({ value, count, size = "sm" }: { value: number; count?: number; size?: "sm" | "md" }) {
  const s = size === "sm" ? "size-3" : "size-4";
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Rated ${value.toFixed(1)} out of 5`}>
      <span className="flex" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={cn(s, i < Math.round(value) ? "fill-ink text-ink" : "text-stone")} />
        ))}
      </span>
      {count != null && <span className="text-xs text-taupe">({count})</span>}
    </span>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 border border-dashed px-6 py-20 text-center">
      {icon && <div className="text-stone">{icon}</div>}
      <h3 className="text-lg font-medium tracking-tight">{title}</h3>
      {description && <p className="max-w-sm text-sm text-taupe">{description}</p>}
      {action}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, action, className }: { eyebrow?: string; title: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-8 flex items-end justify-between gap-6 md:mb-12", className)}>
      <div>
        {eyebrow && <p className="eyebrow mb-3 text-taupe">{eyebrow}</p>}
        <h2 className="text-headline font-medium">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (page: number) => string }) {
  if (pageCount <= 1) return null;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1);
  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-1 text-sm">
      {page > 1 && (
        <Link className="px-3 py-2 hover:bg-bone" href={hrefFor(page - 1)} rel="prev">
          Previous
        </Link>
      )}
      {pages.map((p, i) => (
        <React.Fragment key={p}>
          {i > 0 && pages[i - 1]! < p - 1 && <span className="px-2 text-taupe">…</span>}
          <Link
            href={hrefFor(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn("min-w-9 px-3 py-2 text-center", p === page ? "bg-ink text-ivory" : "hover:bg-bone")}
          >
            {p}
          </Link>
        </React.Fragment>
      ))}
      {page < pageCount && (
        <Link className="px-3 py-2 hover:bg-bone" href={hrefFor(page + 1)} rel="next">
          Next
        </Link>
      )}
    </nav>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("border bg-surface", className)}>{children}</div>;
}

export function StatusPill({ status }: { status: string }) {
  const tone: Record<string, keyof typeof badgeTones> = {
    PAID: "success",
    SUCCEEDED: "success",
    DELIVERED: "success",
    READY: "success",
    ACTIVE: "success",
    PUBLISHED: "success",
    APPROVED: "success",
    SHIPPED: "ink",
    PROCESSING: "warning",
    PENDING: "warning",
    PENDING_PAYMENT: "warning",
    REQUIRES_ACTION: "warning",
    DRAFT: "neutral",
    UPLOADING: "neutral",
    FAILED: "danger",
    REJECTED: "danger",
    CANCELLED: "danger",
    SUSPENDED: "danger",
    REFUNDED: "outline",
    PARTIALLY_REFUNDED: "outline",
    ARCHIVED: "outline",
  };
  return <Badge tone={tone[status] ?? "neutral"}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}
