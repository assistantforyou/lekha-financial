import * as React from "react"
import { cn } from "@/lib/utils"
export const Input = React.forwardRef(({ className, type, ...p }, ref) => <input ref={ref} type={type} data-slot="input" className={cn("flex h-9 w-full min-w-0 rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50", className)} {...p} />)
Input.displayName = "Input"
export const Textarea = React.forwardRef(({ className, ...p }, ref) => <textarea ref={ref} className={cn("flex min-h-20 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30", className)} {...p} />)
Textarea.displayName = "Textarea"
