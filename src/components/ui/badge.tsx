import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden backdrop-blur-md",
  {
    variants: {
      variant: {
        default:
          "border-white/20 bg-primary text-primary-foreground shadow-sm ring-1 ring-white/15 [a&]:hover:bg-primary/90",
        secondary:
          "border-white/35 bg-white/55 text-foreground shadow-sm ring-1 ring-white/25 dark:border-white/12 dark:bg-white/8 dark:text-foreground [a&]:hover:bg-white/70 dark:[a&]:hover:bg-white/12",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border-white/40 bg-white/35 text-foreground ring-1 ring-white/20 dark:border-white/12 dark:bg-white/6 [a&]:hover:bg-white/50 dark:[a&]:hover:bg-white/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
