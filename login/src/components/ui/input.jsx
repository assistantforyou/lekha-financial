import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-input bg-white px-3 py-1 text-sm text-foreground",
        "placeholder:text-muted-foreground/60 selection:bg-primary selection:text-primary-foreground",
        "outline-none transition-colors file:inline-flex file:border-0 file:bg-transparent file:text-sm",
        "focus-visible:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/15",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/15",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
