"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isSupabaseConfiguredAsync } from "@/lib/supabase/client";

export function SyncBanner() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    void isSupabaseConfiguredAsync().then(setConfigured);
  }, []);

  if (configured !== false) return null;

  return (
    <div className="mb-4 rounded-2xl border border-[#ff9500]/30 bg-[#ff9500]/10 px-4 py-3 text-sm">
      <p className="font-medium text-foreground">Cloud sync is not set up yet</p>
      <p className="text-muted mt-0.5">
        Add Supabase keys so both phones stay in sync automatically — no login required.
      </p>
      <Link href="/sync" className="inline-block mt-2 text-[#007aff] font-medium">
        Open Sync settings →
      </Link>
    </div>
  );
}
