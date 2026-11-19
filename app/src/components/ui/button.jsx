import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 shrink-0 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer", {
  variants: {
    variant: { default: "bg-primary text-primary-foreground hover:bg-primary/90", secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80", outline: "border border-border bg-transparent text-foreground hover:bg-accent", ghost: "text-muted-foreground hover:bg-accent hover:text-foreground", destructive: "bg-destructive text-white hover:bg-destructive/90", link: "text-primary underline-offset-4 hover:underline" },
    size: { default: "h-9 px-4 py-2", sm: "h-8 rounded-md px-3 text-xs", lg: "h-10 px-6", icon: "size-9" },
  }, defaultVariants: { variant: "default", size: "default" } })
const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => { const Comp = asChild ? Slot : "button"; return <Comp ref={ref} data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} /> })
Button.displayName = "Button"
export { Button, buttonVariants }
