import { cn } from "@/lib/utils";

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function GlassInput({ label, className, id, ...props }: GlassInputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-muted px-1">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "glass rounded-2xl px-4 py-3 text-foreground placeholder:text-muted",
          "outline-none focus:ring-2 focus:ring-[#007aff]/40 transition-all duration-200",
          className
        )}
        {...props}
      />
    </div>
  );
}
