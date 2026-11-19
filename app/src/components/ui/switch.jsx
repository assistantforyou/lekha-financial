import * as S from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"
export const Switch = ({ className, ...p }) => <S.Root className={cn("peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition data-[state=checked]:bg-primary focus-visible:ring-[3px] focus-visible:ring-ring/40 outline-none", className)} {...p}><S.Thumb className="pointer-events-none block size-4 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" /></S.Root>
