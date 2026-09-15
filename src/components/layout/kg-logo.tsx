"use client";

import { OWNER_LABEL, MEMBER_LABEL, SHOW_NAMES } from "@/lib/branding";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { KgMark } from "@/components/layout/kg-mark";
import { BRAND_INITIALS } from "@/lib/brand";
import { cn } from "@/lib/utils";


/**
 * True once on the client, false during server render and hydration — the
 * "mounted" flag, without an effect that sets state on mount.
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

interface KgLogoProps {
  size?: "header" | "hero";
  showSubtitle?: boolean;
  className?: string;
  asLink?: boolean;
}

export function KgLogo({
  size = "header",
  showSubtitle = true,
  className,
  asLink = true,
}: KgLogoProps) {
  const isHero = size === "hero";
  const motionReady = useIsClient();

  const content = (
    <div className={cn("relative inline-flex items-center gap-2.5", className)}>
      <div className="relative shrink-0">
        <div
          className={cn(
            "kg-glow absolute -inset-1.5 rounded-full blur-lg pointer-events-none",
            isHero ? "opacity-60" : "opacity-45"
          )}
          aria-hidden
        />
        <KgMark
          className={cn("relative", isHero ? "w-12 h-12 md:w-14 md:h-14" : "w-8 h-8")}
        />
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "inline-flex font-bold tracking-tight",
              isHero ? "text-4xl md:text-5xl" : "text-xl"
            )}
          >
            {BRAND_INITIALS.split("").map((letter, index) => (
              <span
                key={`${letter}-${index}`}
                className={cn(
                  "kg-gradient-text inline-block",
                  motionReady && "kg-letter"
                )}
                style={{ animationDelay: `${index * 0.07}s` }}
              >
                {letter}
              </span>
            ))}
          </span>

          <span
            className={cn(
              "kg-finance font-semibold tracking-tight kg-finance-text relative overflow-hidden inline-block",
              isHero ? "text-2xl md:text-3xl" : "text-base"
            )}
          >
            Finance
          </span>
        </div>

        {showSubtitle && SHOW_NAMES && (
          <p
            suppressHydrationWarning
            className={cn(
              "mt-0.5 flex items-center gap-1",
              motionReady && "kg-subtitle",
              isHero ? "text-sm" : "text-[11px]"
            )}
          >
            <span className="kg-name-owner">{OWNER_LABEL}</span>
            <span className="text-muted kg-amp">&</span>
            <span className="kg-name-member">{MEMBER_LABEL}</span>
          </p>
        )}
      </div>
    </div>
  );

  if (!asLink) return content;

  return (
    <Link
      href="/"
      aria-label="KG Finance — home"
      className="group outline-none rounded-xl focus-visible:ring-2 focus-visible:ring-[#007aff]/50"
    >
      {content}
    </Link>
  );
}
