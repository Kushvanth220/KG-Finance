import { COUNTRY_META } from "@/lib/remittances";
import type { RemittanceCountry } from "@/types";
import { cn } from "@/lib/utils";

/**
 * The two flags, drawn.
 *
 * Not emoji: Windows renders 🇮🇳 as the letters "IN", so a flag emoji is a
 * flag on a phone and a typo on a desktop. Drawn at 3:2 with a hairline edge,
 * so the Philippines' white triangle and India's white band hold on a light
 * page as well as a dark one.
 */
export function CountryFlag({ country, className }: { country: RemittanceCountry; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`${COUNTRY_META[country].name} flag`}
      className={cn(
        "inline-block h-4 w-6 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/15 dark:ring-white/20",
        className
      )}
    >
      <svg viewBox="0 0 30 20" className="block h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {country === "IN" ? (
          <>
            <rect width="30" height="6.67" fill="#FF9933" />
            <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
            <rect y="13.33" width="30" height="6.67" fill="#138808" />
            <circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" strokeWidth="0.6" />
            <circle cx="15" cy="10" r="0.6" fill="#000080" />
          </>
        ) : (
          <>
            <rect width="30" height="10" fill="#0038A8" />
            <rect y="10" width="30" height="10" fill="#CE1126" />
            <polygon points="0,0 17.32,10 0,20" fill="#FFFFFF" />
            <circle cx="5.8" cy="10" r="2.1" fill="#FCD116" />
            <circle cx="1.9" cy="2.6" r="0.75" fill="#FCD116" />
            <circle cx="1.9" cy="17.4" r="0.75" fill="#FCD116" />
            <circle cx="14.1" cy="10" r="0.75" fill="#FCD116" />
          </>
        )}
      </svg>
    </span>
  );
}
