import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,color,border-color,opacity,transform] duration-300 ease-[var(--ease-luxe)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.985] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-ivory hover:bg-graphite",
        secondary: "bg-bone text-ink hover:bg-sand",
        outline: "border border-ink/80 bg-transparent text-ink hover:bg-ink hover:text-ivory",
        ghost: "bg-transparent text-ink hover:bg-bone",
        link: "h-auto px-0 text-ink underline-offset-4 hover:underline",
        danger: "bg-danger text-white hover:bg-danger/90",
        inverse: "bg-ivory text-ink hover:bg-white",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-11 px-5 text-xs uppercase tracking-[0.16em]",
        lg: "h-14 px-8 text-xs uppercase tracking-[0.18em]",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
