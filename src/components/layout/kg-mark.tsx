import { cn } from "@/lib/utils";

/*
 * The lion — the artwork itself, not a redrawing of it.
 *
 * It is a mask filled with the `--lion` ink, so one file serves every ground:
 * navy on light, ice blue on dark and on the always-dark screens. The mark
 * uses a small copy with its faint strokes lifted (`lion-mark.webp`), because
 * at header size the full engraving's hairlines vanish; the entrance on the
 * launch screen and the intro uses the full one.
 */
const MARK = "url(/brand/lion-mark.webp) center / contain no-repeat";

interface KgMarkProps {
  className?: string;
  /** Names the mark for screen readers; without it the mark is decoration. */
  title?: string;
}

export function KgMark({ className, title }: KgMarkProps) {
  return (
    <span
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("block bg-lion", className)}
      style={{ WebkitMask: MARK, mask: MARK }}
    />
  );
}
