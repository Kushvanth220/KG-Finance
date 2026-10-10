import { hubsMentioned, leavesMentioned, type FinanceGraph, type HubKey } from "@/lib/assistant-graph";

/**
 * An answer, played as a tour of the money map.
 *
 * The reply is cut into sentences; each becomes a stop that frames whatever
 * that sentence names — a hub by the words people use for it ("spent",
 * "owe"), a node by its label ("Chime", "Groceries") — and holds long enough
 * to read. A sentence that names nothing is still a stop: the map pulls back
 * to the whole universe while it is read.
 */

export interface TourStop {
  /** The sentence, as a person reads it: markdown taken off. */
  text: string;
  /** Hubs this stop is about, including the hubs of the nodes it names. */
  hubs: HubKey[];
  /** Node ids this stop names. */
  leaves: string[];
  /** How long the stop holds, in milliseconds: long enough to read it. */
  ms: number;
}

/** More stops than this and a tour stops feeling like one; sentences are grouped instead. */
export const MAX_STOPS = 8;

const MIN_MS = 2600;
const MAX_MS = 8000;
const BASE_MS = 1500;
const PER_WORD_MS = 280;

/** Lines a person would read, with the markdown the model writes taken off. */
function plainLines(reply: string): string[] {
  return reply
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "") // headings
        .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "") // bullets and numbered points
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links keep their words
        .replace(/\*\*|__|\*|`/g, "") // emphasis and code marks
        .trim()
    )
    .filter(Boolean);
}

/**
 * Sentences, split where one ends and the next begins with a capital, a
 * digit or a dollar sign — so "$412.30" and "e.g. this" stay whole.
 */
export function splitSentences(reply: string): string[] {
  return plainLines(reply)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=["“'(]?[A-Z0-9$])/))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function readingMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(MAX_MS, Math.max(MIN_MS, BASE_MS + words * PER_WORD_MS));
}

export function buildAnswerTour(graph: FinanceGraph, reply: string): TourStop[] {
  const sentences = splitSentences(reply);
  if (sentences.length === 0) return [];

  // Too many sentences: group them evenly so the tour keeps to MAX_STOPS.
  const size = Math.ceil(sentences.length / MAX_STOPS);
  const groups: string[] = [];
  for (let i = 0; i < sentences.length; i += size) groups.push(sentences.slice(i, i + size).join(" "));

  const hubOf = new Map(graph.hubs.flatMap((hub) => hub.leaves.map((leaf) => [leaf.id, hub.key] as const)));
  return groups.map((text) => {
    const leaves = leavesMentioned(graph, text);
    const hubs = [...new Set([...hubsMentioned(text), ...leaves.map((id) => hubOf.get(id)).filter((key): key is HubKey => !!key)])];
    return { text, hubs, leaves, ms: readingMs(text) };
  });
}

/** Everything lit by the first `count` stops: the tour lights the map as it goes. */
export function litSoFar(stops: TourStop[], count: number) {
  const seen = stops.slice(0, Math.max(0, count));
  return {
    hubs: [...new Set(seen.flatMap((stop) => stop.hubs))],
    leaves: [...new Set(seen.flatMap((stop) => stop.leaves))],
  };
}
