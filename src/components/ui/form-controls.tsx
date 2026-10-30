import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full border border-border bg-surface px-3.5 text-sm text-ink placeholder:text-taupe transition-colors focus:border-ink focus:outline-none aria-[invalid=true]:border-danger disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(control, "h-11", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(control, "min-h-28 py-3", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      control,
      "h-11 appearance-none bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23161513' stroke-width='1.5'%3E%3Cpath d='m3 4.5 3 3 3-3'/%3E%3C/svg%3E\")] bg-[length:12px] bg-[right_0.9rem_center] bg-no-repeat pr-9",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = "NativeSelect";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("eyebrow mb-2 block text-graphite", className)} {...props} />;
}

export const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: React.ReactNode }>(
  ({ className, label, id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    return (
      <label htmlFor={inputId} className={cn("flex cursor-pointer items-start gap-3 text-sm text-graphite", className)}>
        <input ref={ref} id={inputId} type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer accent-ink" {...props} />
        <span>{label}</span>
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";

/** Label + control + error message with correct ARIA wiring. */
export function Field({
  label,
  error,
  hint,
  children,
  className,
  htmlFor,
}: {
  label?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
  className?: string;
  htmlFor?: string;
}) {
  const autoId = React.useId();
  const id = htmlFor ?? children.props.id ?? autoId;
  const errorId = `${id}-error`;
  return (
    <div className={cn("space-y-1", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {React.cloneElement(children, { id, "aria-invalid": !!error || undefined, "aria-describedby": error ? errorId : undefined })}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-taupe">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
      {message}
    </div>
  );
}
