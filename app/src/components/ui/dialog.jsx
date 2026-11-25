import * as D from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
/* The Quick Tour sits above open dialogs (search, menu) so a visitor can work them while it points; its own buttons must not count as "outside". */
const keepTour = (e) => { const t = e.target; if (t && t.closest && t.closest("#lekha-tour")) e.preventDefault() }
const tourSafe = (p) => ({ ...p, onPointerDownOutside: (e) => { keepTour(e); p.onPointerDownOutside && p.onPointerDownOutside(e) }, onFocusOutside: (e) => { keepTour(e); p.onFocusOutside && p.onFocusOutside(e) }, onInteractOutside: (e) => { keepTour(e); p.onInteractOutside && p.onInteractOutside(e) } })
export const Dialog = D.Root, DialogTrigger = D.Trigger, DialogClose = D.Close
export const DialogContent = ({ className, children, hideClose, ...p }) => (
  <D.Portal><D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
    <D.Content className={cn("fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-2xl outline-none max-h-[88dvh] overflow-y-auto", className)} {...tourSafe(p)}>{children}
      {!hideClose && <D.Close className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground opacity-80 hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 outline-none"><X className="size-4" /><span className="sr-only">Close</span></D.Close>}
    </D.Content></D.Portal>)
export const DialogHeader = ({ className, ...p }) => <div className={cn("flex flex-col gap-1.5", className)} {...p} />
export const DialogFooter = ({ className, ...p }) => <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...p} />
export const DialogTitle = ({ className, ...p }) => <D.Title className={cn("text-lg font-semibold leading-none", className)} {...p} />
export const DialogDescription = ({ className, ...p }) => <D.Description className={cn("text-sm text-muted-foreground", className)} {...p} />
const sheetV = cva("fixed z-50 flex flex-col gap-3 border-border bg-popover text-popover-foreground shadow-2xl outline-none", { variants: { side: { left: "inset-y-0 left-0 w-[88vw] max-w-sm border-r", right: "inset-y-0 right-0 w-[92vw] max-w-xl border-l", bottom: "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t" } }, defaultVariants: { side: "right" } })
export const SheetContent = ({ className, side, children, ...p }) => (
  <D.Portal><D.Overlay className="fixed inset-0 z-50 bg-black/60" />
    <D.Content className={cn(sheetV({ side }), className)} {...tourSafe(p)}>{children}<D.Close className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"><X className="size-4" /><span className="sr-only">Close</span></D.Close></D.Content></D.Portal>)
