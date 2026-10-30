import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="w-full overflow-x-auto border bg-surface">
      <table className={cn("w-full border-collapse text-left text-sm", className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b bg-ivory/60">{children}</thead>;
}

export function TH({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={cn("eyebrow whitespace-nowrap px-4 py-3 font-medium text-taupe", className)} {...props}>
      {children}
    </th>
  );
}

export function TR({ className, children }: { className?: string; children: React.ReactNode }) {
  return <tr className={cn("border-b last:border-0 hover:bg-ivory/50", className)}>{children}</tr>;
}

export function TD({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-3 align-middle", className)} {...props}>
      {children}
    </td>
  );
}
