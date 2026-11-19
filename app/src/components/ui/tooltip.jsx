import * as T from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"
export const TooltipProvider = ({ children }) => <T.Provider delayDuration={250}>{children}</T.Provider>
export const Tooltip = ({ content, children, side = "bottom" }) => content ? <T.Root><T.Trigger asChild>{children}</T.Trigger><T.Portal><T.Content side={side} sideOffset={6} className="z-[60] max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md">{content}</T.Content></T.Portal></T.Root> : children
