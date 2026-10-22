import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

// Adapted from shadcn/ui (MIT); see THIRD_PARTY_NOTICES.md.
export const buttonVariants = cva("ui-button", {
  variants: {
    variant: { default: "ui-button-primary", outline: "ui-button-outline", ghost: "ui-button-ghost" },
    size: { default: "", icon: "ui-button-icon", sm: "ui-button-sm" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export function Button({ className, variant, size, asChild = false, ...props }:
  React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "button";
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
