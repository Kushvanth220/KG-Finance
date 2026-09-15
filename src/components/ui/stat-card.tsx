import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";

interface StatCardProps {
  label: string;
  value: number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
  prefix?: string;
  isCurrency?: boolean;
}

export function StatCard({
  label,
  value,
  subtitle,
  trend,
  className,
  prefix,
  isCurrency = true,
}: StatCardProps) {
  const trendColors = {
    up: "text-[#34c759]",
    down: "text-[#ff3b30]",
    neutral: "text-muted",
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-sm text-muted font-medium">{label}</span>
      <span className="text-2xl font-semibold tracking-tight">
        {prefix}
        {isCurrency ? formatCurrency(value) : value.toLocaleString()}
      </span>
      {subtitle && (
        <span className={cn("text-xs font-medium", trend ? trendColors[trend] : "text-muted")}>
          {subtitle}
        </span>
      )}
    </div>
  );
}
