import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Sizes start at 44px because everything here is tapped with a thumb,
 * often through a work glove.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium " +
    "transition-[background-color,border-color,color,box-shadow] duration-100 " +
    "disabled:pointer-events-none disabled:opacity-45 " +
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 active:scale-[0.985] select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-text hover:bg-accent-hover shadow-[0_1px_2px_rgb(0_0_0/0.08)]",
        secondary:
          "bg-surface text-ink border border-line-strong hover:bg-surface-2",
        ghost: "text-ink hover:bg-surface-2",
        subtle: "bg-surface-2 text-ink hover:bg-surface-sunk",
        danger: "bg-danger text-white hover:brightness-110",
        success: "bg-available text-white hover:brightness-110",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm [&_svg]:size-4",
        md: "h-11 px-4 [&_svg]:size-[18px]",
        lg: "h-[52px] px-5 text-base [&_svg]:size-5",
        icon: "size-11 [&_svg]:size-5",
        "icon-sm": "size-9 [&_svg]:size-4",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, block }), className)}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    />
  );
}

export { buttonVariants };
