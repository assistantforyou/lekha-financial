import { Command as C } from "cmdk"
import { Search } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "./dialog"
import { cn } from "@/lib/utils"
export const Command = ({ className, ...p }) => <C className={cn("flex size-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground", className)} {...p} />
export const CommandDialog = ({ children, ...p }) => <Dialog {...p}><DialogContent hideClose className="top-[18%] translate-y-0 overflow-hidden p-0 max-w-xl gap-0"><DialogTitle className="sr-only">Search</DialogTitle><Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">{children}</Command></DialogContent></Dialog>
export const CommandInput = ({ className, ...p }) => <div className="flex items-center gap-2 border-b border-border px-3"><Search className="size-4 text-muted-foreground" /><C.Input className={cn("h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground", className)} {...p} /></div>
export const CommandList = ({ className, ...p }) => <C.List className={cn("max-h-[60dvh] overflow-y-auto p-1", className)} {...p} />
export const CommandEmpty = (p) => <C.Empty className="py-8 text-center text-sm text-muted-foreground" {...p} />
export const CommandGroup = ({ className, ...p }) => <C.Group className={cn("overflow-hidden p-1", className)} {...p} />
export const CommandItem = ({ className, ...p }) => <C.Item className={cn("relative flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[selected=true]:bg-accent", className)} {...p} />
