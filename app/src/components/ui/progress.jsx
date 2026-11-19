import * as P from "@radix-ui/react-progress"
import { cn } from "@/lib/utils"
export const Progress = ({ className, value, ...p }) => <P.Root className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)} value={value} {...p}><P.Indicator className="h-full bg-primary transition-all" style={{ width: `${value || 0}%` }} /></P.Root>
