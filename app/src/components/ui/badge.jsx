import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", {
  variants: { variant: { default: "border-transparent bg-primary text-primary-foreground", secondary: "border-transparent bg-secondary text-secondary-foreground", outline: "border-border text-muted-foreground", up: "border-transparent bg-[color-mix(in_srgb,var(--up)_16%,transparent)] text-[var(--up)]", down: "border-transparent bg-[color-mix(in_srgb,var(--down)_16%,transparent)] text-[var(--down)]", warn: "border-transparent bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] text-[var(--warn)]" } }, defaultVariants: { variant: "outline" } })
export const Badge = ({ className, variant, ...p }) => <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...p} />
