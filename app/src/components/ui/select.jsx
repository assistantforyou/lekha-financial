import * as S from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
export const Select = S.Root
export const SelectTrigger = ({ className, children, ...p }) => <S.Trigger className={cn("flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 cursor-pointer", className)} {...p}><span className="truncate"><S.Value /></span><S.Icon><ChevronDown className="size-4 opacity-60" /></S.Icon></S.Trigger>
export const SelectContent = ({ className, children, ...p }) => <S.Portal><S.Content position="popper" sideOffset={4} className={cn("z-[70] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg", className)} {...p}><S.Viewport className="p-1">{children}</S.Viewport></S.Content></S.Portal>
export const SelectItem = ({ className, children, ...p }) => <S.Item className={cn("relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none data-[highlighted]:bg-accent", className)} {...p}><S.ItemText>{children}</S.ItemText><S.ItemIndicator className="absolute right-2"><Check className="size-4" /></S.ItemIndicator></S.Item>
