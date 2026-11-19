import * as LabelPrimitive from "@radix-ui/react-label"
import { cn } from "@/lib/utils"
export const Label = ({ className, ...p }) => <LabelPrimitive.Root className={cn("text-[13px] font-medium leading-none select-none", className)} {...p} />
