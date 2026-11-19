import { cn } from "@/lib/utils"
export const Table = ({ className, ...p }) => <div className="relative w-full overflow-x-auto"><table className={cn("w-full caption-bottom text-[13px]", className)} {...p} /></div>
export const TableHeader = ({ className, ...p }) => <thead className={cn("[&_tr]:border-b", className)} {...p} />
export const TableBody = (p) => <tbody {...p} />
export const TableRow = ({ className, ...p }) => <tr className={cn("border-b border-border/70 transition-colors hover:bg-accent/50", className)} {...p} />
export const TableHead = ({ className, ...p }) => <th className={cn("h-9 px-3 text-left align-middle text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap", className)} {...p} />
export const TableCell = ({ className, ...p }) => <td className={cn("px-3 py-2 align-middle", className)} {...p} />
