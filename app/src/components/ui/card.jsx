import { cn } from "@/lib/utils"
export const Card = ({ className, ...p }) => <div data-slot="card" className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-sm", className)} {...p} />
export const CardHeader = ({ className, ...p }) => <div className={cn("flex flex-col gap-1.5 px-5 pt-5", className)} {...p} />
export const CardTitle = ({ className, ...p }) => <h3 className={cn("text-[15px] font-semibold leading-none tracking-tight", className)} {...p} />
export const CardDescription = ({ className, ...p }) => <p className={cn("text-[13px] text-muted-foreground", className)} {...p} />
export const CardContent = ({ className, ...p }) => <div className={cn("px-5 py-4", className)} {...p} />
export const CardFooter = ({ className, ...p }) => <div className={cn("flex items-center gap-2 px-5 pb-5", className)} {...p} />
