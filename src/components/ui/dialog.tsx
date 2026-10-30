"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, title, description, ...props }: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />
      <D.Content
        className={cn("fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto bg-ivory p-6 shadow-2xl sm:p-8", className)}
        {...props}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-xl font-medium tracking-tight">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-sm text-taupe">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="-m-2 p-2 text-graphite hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

/** Side drawer built on Dialog (accessible focus trap, escape to close). */
export function Drawer({
  open,
  onOpenChange,
  side = "right",
  title,
  children,
  className,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "left" | "right";
  title: string;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <D.Content
          className={cn(
            "fixed top-0 z-50 flex h-dvh w-full max-w-md flex-col bg-ivory shadow-2xl outline-none transition-transform duration-500 ease-[var(--ease-luxe)]",
            side === "right" ? "right-0" : "left-0",
            className,
          )}
        >
          <div className="flex items-center justify-between border-b px-6 py-5">
            <D.Title className="eyebrow text-ink">{title}</D.Title>
            <D.Description className="sr-only">{title}</D.Description>
            <D.Close className="-m-2 p-2 text-graphite hover:text-ink" aria-label="Close">
              <X className="size-5" />
            </D.Close>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="border-t px-6 py-5">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
