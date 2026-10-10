"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  CalendarClock,
  CreditCard,
  Landmark,
  Send,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  argumentText,
  hubsForTools,
  hubsMentioned,
  leavesMentioned,
  type FinanceGraph,
  type HubKey,
  type Tone,
} from "@/lib/assistant-graph";
import type { AssistantActivity } from "@/components/assistant/use-assistant-chat";
import type { CouncilStage } from "@/lib/ai/council";

export const TONE_COLOR: Record<Tone, string> = {
  good: "var(--ws-good)",
  warn: "var(--ws-warn)",
  bad: "var(--ws-bad)",
  neutral: "var(--ws-neutral)",
};

export const HUB_ICON: Record<HubKey, typeof Wallet> = {
  spending: Wallet,
  income: TrendingUp,
  accounts: CreditCard,
  bills: CalendarClock,
  debts: Landmark,
  transfers: Send,
  balance: ArrowLeftRight,
};

export const STAGE_TEXT: Record<CouncilStage, string> = {
  input: "Reading your question",
  draft: "Working it out",
  review: "Checking the answer",
  merge: "Putting it together",
  output: "Answering",
};

/**
 * What the map should be showing about the assistant right now.
 *
 * Driven only by what the assistant reports doing: a question lights the
 * hubs its words name, a tool call lights the hubs it reads, and the answer
 * lights the nodes it mentions. Those stay lit until the next question, so
 * the answer and the part of the map it is about can be read together.
 */
export interface WorkspaceActivity {
  phase: "idle" | "thinking" | "confirm";
  stage: CouncilStage | null;
  activeHubs: HubKey[];
  litLeaves: string[];
  lastAsk: string | null;
  lastReply: string | null;
  confirm: string | null;
  /** Bumped on every event, so pulses can restart on news. */
  beat: number;
}

const IDLE: WorkspaceActivity = {
  phase: "idle",
  stage: null,
  activeHubs: [],
  litLeaves: [],
  lastAsk: null,
  lastReply: null,
  confirm: null,
  beat: 0,
};

const union = <T,>(a: T[], b: T[]) => [...new Set([...a, ...b])];

function hubOfLeaf(id: string): HubKey {
  return id.split(":")[0] as HubKey;
}

export function reduceActivity(state: WorkspaceActivity, event: AssistantActivity, graph: FinanceGraph): WorkspaceActivity {
  const beat = state.beat + 1;
  switch (event.type) {
    case "ask": {
      const lit = leavesMentioned(graph, event.text);
      return {
        ...state,
        phase: "thinking",
        stage: "input",
        lastAsk: event.text,
        activeHubs: union(hubsMentioned(event.text), lit.map(hubOfLeaf)),
        litLeaves: lit,
        confirm: null,
        beat,
      };
    }
    case "stage":
      return { ...state, phase: state.phase === "confirm" ? "confirm" : "thinking", stage: event.stage, beat };
    case "tools": {
      const lit = event.calls.flatMap((call) => leavesMentioned(graph, argumentText(call.args)));
      return {
        ...state,
        phase: state.phase === "confirm" ? "confirm" : "thinking",
        activeHubs: union(state.activeHubs, union(hubsForTools(event.calls.map((call) => call.name)), lit.map(hubOfLeaf))),
        litLeaves: union(state.litLeaves, lit),
        beat,
      };
    }
    case "reply": {
      const lit = leavesMentioned(graph, event.text);
      return {
        ...state,
        // The answer is here: stop "thinking" now, not after the chat has
        // reloaded its history — the answer tour starts on this.
        phase: state.phase === "confirm" ? "confirm" : "idle",
        stage: null,
        lastReply: event.text,
        activeHubs: union(state.activeHubs, union(hubsMentioned(event.text), lit.map(hubOfLeaf))),
        litLeaves: union(state.litLeaves, lit),
        beat,
      };
    }
    case "confirm":
      return { ...state, phase: "confirm", confirm: event.preview, beat };
    case "saved":
      return { ...state, phase: "idle", confirm: null, lastReply: event.text, beat };
    case "error":
      return { ...state, phase: "idle", stage: null, beat };
    case "idle":
      return { ...state, phase: state.confirm ? "confirm" : "idle", stage: null, beat };
  }
}

export function useWorkspaceActivity(graph: FinanceGraph) {
  const [activity, setActivity] = useState<WorkspaceActivity>(IDLE);
  // Events arrive from long-lived handlers; read the newest map when they do.
  const graphRef = useRef(graph);
  useEffect(() => {
    graphRef.current = graph;
  });
  const onActivity = useCallback((event: AssistantActivity) => {
    setActivity((current) => reduceActivity(current, event, graphRef.current));
  }, []);
  const clear = useCallback(() => setActivity(IDLE), []);
  return { activity, onActivity, clear };
}
