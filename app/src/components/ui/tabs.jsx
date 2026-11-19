import * as T from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"
export const Tabs = ({ className, ...p }) => <T.Root className={cn("flex flex-col gap-3", className)} {...p} />
export const TabsList = ({ className, ...p }) => <T.List className={cn("inline-flex h-9 w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground [scrollbar-width:none]", className)} {...p} />
export const TabsTrigger = ({ className, ...p }) => <T.Trigger className={cn("inline-flex h-[calc(100%-1px)] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm", className)} {...p} />
export const TabsContent = ({ className, ...p }) => <T.Content className={cn("outline-none", className)} {...p} />
