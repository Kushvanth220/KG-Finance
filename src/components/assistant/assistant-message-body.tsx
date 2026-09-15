"use client";

import { Fragment, type ReactNode } from "react";
import {
  parseMessageBlocks,
  type MessageBlock,
} from "@/lib/ai/parse-message-blocks";

/**
 * The assistant answers "pull up my accounts" with a markdown table. The chat
 * used to print `message.content` straight into a whitespace-pre-wrap div, so
 * those arrived as literal pipes and dashes — the "manual text" problem. This
 * renders tables as real tables and leaves everything else as plain lines.
 *
 * Deliberately tiny: only the few constructs the assistant actually produces
 * (tables, bold, bullets). No markdown dependency for three features.
 */

/** Inline **bold** only — the assistant does not emit anything else inline. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-b${index}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={`${keyPrefix}-t${index}`}>{part}</Fragment>;
  });
}

export function AssistantMessageBody({ content }: { content: string }) {
  const blocks: MessageBlock[] = parseMessageBlocks(content);

  if (blocks.length === 1 && blocks[0]!.kind === "text") {
    return <span className="whitespace-pre-wrap">{inline(content, "only")}</span>;
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.kind === "text") {
          const body = block.lines.join("\n").trim();
          if (!body) return null;
          return (
            <p key={`b${index}`} className="whitespace-pre-wrap">
              {inline(body, `b${index}`)}
            </p>
          );
        }
        return (
          // Wide tables scroll inside the bubble instead of stretching the panel.
          <div key={`b${index}`} className="-mx-1 overflow-x-auto">
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                <tr>
                  {block.head.map((cell, c) => (
                    <th
                      key={`h${c}`}
                      className="border-b border-white/15 px-1.5 py-1 text-left font-semibold text-foreground/70 whitespace-nowrap"
                    >
                      {inline(cell, `h${index}-${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={`r${r}`} className="border-b border-white/[0.06] last:border-0">
                    {row.map((cell, c) => (
                      <td
                        key={`c${c}`}
                        className="px-1.5 py-1 align-top tabular-nums whitespace-nowrap"
                      >
                        {inline(cell, `r${index}-${r}-${c}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
