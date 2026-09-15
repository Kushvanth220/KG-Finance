"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import { FLEX_BLUE } from "@/lib/flex";
import { cn } from "@/lib/utils";

/**
 * The Amazon Flex mark at the top of the tracker.
 *
 * Save the artwork as `public/amazon-flex.png` and it appears here. One fixed
 * name on purpose: every name tried is a request, and a list of candidates
 * would leave 404s in the console forever for the formats that never arrive.
 *
 * Until the file exists this draws a plain badge rather than an imitation of
 * someone else's logo — a drawn-from-memory Amazon smile would be wrong in the
 * details and look worse than an honest placeholder.
 */

const MARK = "/amazon-flex.png";

export function FlexMark({ className }: { className?: string }) {
  const [missing, setMissing] = useState(false);

  if (!missing) {
    return (
      // Not next/image: the artwork's dimensions are not known ahead of time,
      // and a missing file has to fail softly into the badge below.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={MARK}
        alt="Amazon Flex"
        onError={() => setMissing(true)}
        className={cn("h-8 w-auto max-w-[190px] object-contain object-left", className)}
      />
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className="flex h-7 w-7 items-center justify-center rounded-lg"
        style={{ background: FLEX_BLUE }}
      >
        <Truck className="h-4 w-4 text-white" />
      </span>
      <span className="text-lg font-bold leading-tight">
        Amazon <span style={{ color: FLEX_BLUE }}>Flex</span>
      </span>
    </span>
  );
}
