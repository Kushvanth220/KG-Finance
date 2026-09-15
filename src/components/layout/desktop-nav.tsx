"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isMoreNavActive,
  isNavActive,
  moreNavItems,
  primaryNavItems,
} from "@/components/layout/nav-config";

export function DesktopNav() {
  const pathname = usePathname();
  // The menu remembers the route it opened on; navigating away closes it
  // by definition, with no effect needed.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (next: boolean) => setOpenAt(next ? pathname : null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreActive = isMoreNavActive(pathname);

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="hidden md:flex items-center gap-1 flex-1 justify-end">
      {primaryNavItems.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "tap-card focus-ring flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap",
              active
                ? "bg-[#007aff] text-white shadow-md shadow-[#007aff]/20"
                : "text-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
            )}
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </Link>
        );
      })}

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
            moreActive || open
              ? "bg-[#007aff] text-white shadow-md shadow-[#007aff]/20"
              : "text-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
          )}
        >
          <LayoutGrid className="w-4 h-4" />
          More
        </button>

        {open && (
          <div className="absolute right-0 top-[calc(100%+0.5rem)] w-52 glass-strong rounded-2xl p-2 shadow-xl border border-white/10 z-50 animate-scale-in">
            {moreNavItems.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "tap-card focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                    active
                      ? "bg-[#007aff]/12 text-[#007aff]"
                      : "hover:bg-black/5 dark:hover:bg-white/5 text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" style={{ color: active ? undefined : item.tint }} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
