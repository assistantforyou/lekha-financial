import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
const v = cva("relative flex w-full gap-3 rounded-lg border px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0", { variants: { variant: { default: "border-border bg-card", warn: "border-[color-mix(in_srgb,var(--warn)_45%,var(--border))] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)]", destructive: "border-[color-mix(in_srgb,var(--down)_45%,var(--border))] bg-[color-mix(in_srgb,var(--down)_10%,transparent)] text-foreground", success: "border-[color-mix(in_srgb,var(--up)_45%,var(--border))] bg-[color-mix(in_srgb,var(--up)_10%,transparent)]" } }, defaultVariants: { variant: "default" } })
export const Alert = ({ className, variant, ...p }) => <div role="alert" className={cn(v({ variant }), className)} {...p} />
export const AlertTitle = ({ className, ...p }) => <div className={cn("font-medium leading-none mb-1", className)} {...p} />
export const AlertDescription = ({ className, ...p }) => <div className={cn("text-[13px] text-muted-foreground", className)} {...p} />
