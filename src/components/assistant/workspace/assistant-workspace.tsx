"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Minimize2, Network, Orbit, Plus, Search, Sparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import { useAssistant } from "@/components/assistant/assistant-context";
import { AssistantNameSetup } from "@/components/assistant/assistant-name-setup";
import { useAssistantChat } from "@/components/assistant/use-assistant-chat";
import { KgMark } from "@/components/layout/kg-mark";
import { AnswerTourCard } from "@/components/assistant/workspace/answer-tour-card";
import { DetailPanel } from "@/components/assistant/workspace/detail-panel";
import { FocusFan } from "@/components/assistant/workspace/focus-fan";
import { MoneyUniverse } from "@/components/assistant/workspace/money-universe";
import { HUB_ICON, STAGE_TEXT, useWorkspaceActivity } from "@/components/assistant/workspace/workspace-state";
import { WorkspaceConversation, type ConversationMode } from "@/components/assistant/workspace/workspace-conversation";
import { buildAnswerTour, litSoFar, type TourStop } from "@/lib/answer-tour";
import { buildFinanceGraph, type HubKey } from "@/lib/assistant-graph";
import { zonedToday } from "@/lib/zoned-date";
import { DEFAULT_ASSISTANT_NAME, useAssistantPreferencesStore } from "@/store/assistant-preferences-store";
import { useFinanceStore } from "@/store/finance-store";
import { PERSON_LABELS, type Person } from "@/types";
import { cn } from "@/lib/utils";

/**
 * The assistant, as a place rather than a chat box.
 *
 * Your money is drawn as a universe — you at the centre, seven hubs around
 * you, every account, category, bill and transfer on its hub — and the
 * assistant works on top of it: ask something and the part of the map it is
 * about lights up, the light runs out along the lines to whatever it is
 * reading, and the nodes its answer names ring gold. Open a hub to see it
 * fanned out; the panel on the right shows the numbers and the assistant's
 * analysis of whatever you are looking at.
 *
 * Everything the old panel did still happens here, through the same engines:
 * text chat with saved sessions, the voice call, the first-run naming, and —
 * always — the confirm card before any money is written. During a call the
 * workspace can shrink to a corner so the site stays usable.
 *
 * One dark world on every device (like the front door): the light only reads
 * on near-black. Under reduced motion the map holds still and says the same.
 */

const WIDE = "(min-width: 1024px)";

function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(WIDE).matches,
    () => true
  );
}

const BRIEFING =
  "Give me a short briefing on my money right now: what needs attention today, what is coming this week, and how this month is going.";

/** An answer being played on the map: which stop, and whether it is moving on by itself. */
interface Tour {
  reply: string;
  stops: TourStop[];
  /** The stop on screen; stops.length once it has finished. */
  index: number;
  playing: boolean;
  /** Bumps whenever a stop starts over, so its timer and bar restart. */
  run: number;
}

// Room the story card takes over the map, so the camera frames things clear of it.
const CARD_INSET_PHONE = 150;
const CARD_INSET_WIDE = 392;

export function AssistantWorkspace({
  open,
  onVoiceLiveChange,
}: {
  open: boolean;
  onVoiceLiveChange?: (live: boolean) => void;
}) {
  if (!open) return null;
  return <Workspace onVoiceLiveChange={onVoiceLiveChange} />;
}

function Workspace({ onVoiceLiveChange }: { onVoiceLiveChange?: (live: boolean) => void }) {
  const { closeAssistant, autoStartVoice, clearAutoStart } = useAssistant();
  const assistantName = useAssistantPreferencesStore((state) => state.assistantName);
  const voiceGender = useAssistantPreferencesStore((state) => state.voiceGender);
  const namingCompleted = useAssistantPreferencesStore((state) => state.namingCompleted);
  const reminders = useAssistantPreferencesStore((state) => state.structuredReminders);
  const displayName = assistantName.trim() || DEFAULT_ASSISTANT_NAME;
  const finance = useFinanceStore();
  const wide = useWide();

  const [person, setPerson] = useState<Person>("kushvanth");
  const [mode, setMode] = useState<ConversationMode>("voice");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [docked, setDocked] = useState(false);
  const [view, setView] = useState<"universe" | "focus">("universe");
  const [selectedHub, setSelectedHub] = useState<HubKey | null>(null);
  const [selectedLeaf, setSelectedLeaf] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const today = zonedToday();
  const graph = useMemo(
    () => buildFinanceGraph({ state: finance, reminders, person, today }),
    [finance, reminders, person, today]
  );
  const { activity, onActivity, clear } = useWorkspaceActivity(graph);
  const chat = useAssistantChat({ assistantName: displayName, onActivity });

  // Every new answer plays as a tour of the map: the camera flies to what
  // each sentence names, lighting it, then pulls back to show it all.
  const [tour, setTour] = useState<Tour | null>(null);
  const [touredReply, setTouredReply] = useState<string | null>(null);
  if (activity.lastReply && activity.lastReply !== touredReply && activity.phase !== "thinking") {
    setTouredReply(activity.lastReply);
    const stops = buildAnswerTour(graph, activity.lastReply);
    setTour(stops.length ? { reply: activity.lastReply, stops, index: 0, playing: true, run: 0 } : null);
    if (stops.length) setView("universe");
  }

  useEffect(() => {
    if (!tour || !tour.playing || tour.index >= tour.stops.length) return;
    const id = window.setTimeout(() => {
      setTour((current) =>
        current && { ...current, index: current.index + 1, run: current.run + 1, playing: current.index + 1 < current.stops.length }
      );
    }, tour.stops[tour.index]!.ms);
    return () => window.clearTimeout(id);
  }, [tour]);

  const step = (by: number) =>
    setTour((current) => current && { ...current, index: Math.max(0, Math.min(current.stops.length, current.index + by)), run: current.run + 1 });
  const thinkingText = activity.phase === "thinking" ? (activity.stage ? STAGE_TEXT[activity.stage] : "Thinking") : null;
  const touring = !!tour && !thinkingText && tour.index < tour.stops.length;
  const tourStop = touring ? tour.stops[tour.index]! : null;
  // While it plays, the map lights only what the tour has reached so far.
  const mapActivity = useMemo(() => {
    if (!touring || !tour) return activity;
    const lit = litSoFar(tour.stops, tour.index + 1);
    return { ...activity, activeHubs: lit.hubs, litLeaves: lit.leaves };
  }, [activity, touring, tour]);
  const tourFocus = tourStop && tourStop.hubs.length + tourStop.leaves.length > 0 ? [...tourStop.hubs, ...tourStop.leaves] : null;
  const cardShown = !!thinkingText || !!tour;
  const hasTour = !!tour;
  const mapLabels = useMemo(
    () => graph.hubs.flatMap((hub) => [hub.label, ...hub.leaves.map((item) => item.label)]),
    [graph]
  );

  const leaf = useMemo(
    () => (selectedLeaf ? graph.hubs.flatMap((hub) => hub.leaves).find((item) => item.id === selectedLeaf) ?? null : null),
    [graph, selectedLeaf]
  );
  // With nothing chosen, the panel follows what the assistant is reading.
  const detailHubKey: HubKey = leaf?.hub ?? selectedHub ?? activity.activeHubs[0] ?? "spending";
  const detailHub = graph.hubs.find((hub) => hub.key === detailHubKey)!;
  const focusHub = view === "focus" ? graph.hubs.find((hub) => hub.key === (selectedHub ?? detailHubKey)) ?? null : null;

  useEffect(() => {
    void useAssistantPreferencesStore.getState().hydrateFromServer();
  }, []);

  useEffect(() => {
    if (docked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [docked]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The confirm card takes Escape first, to dismiss itself.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      // Escape closes the nearest thing first: the search, the answer, then the assistant.
      if (searchOpen) setSearchOpen(false);
      else if (hasTour) setTour(null);
      else closeAssistant();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeAssistant, searchOpen, hasTour]);

  // Choosing something on the map ends the tour: you have taken over the camera.
  const selectHub = (key: HubKey) => {
    setTour(null);
    setSelectedHub(key);
    setSelectedLeaf(null);
    setView("focus");
  };
  const selectLeaf = (id: string) => {
    setTour(null);
    setSelectedLeaf(id);
    setSelectedHub(id.split(":")[0] as HubKey);
  };
  const backToUniverse = () => {
    setView("universe");
    setSelectedHub(null);
    setSelectedLeaf(null);
  };
  const ask = (prompt: string) => {
    if (mode === "voice") setMode("text");
    void chat.handleSend(prompt);
  };
  const analyse = () => ask(leaf?.prompt ?? (selectedHub ? detailHub.prompt : BRIEFING));

  const results = useMemo(() => {
    const words = query.trim().toLowerCase();
    if (!words) return [];
    const hubs = graph.hubs
      .filter((hub) => hub.label.toLowerCase().includes(words))
      .map((hub) => ({ id: `hub:${hub.key}`, label: hub.label, detail: hub.headlineText, hub: hub.key, isHub: true }));
    const leaves = graph.hubs.flatMap((hub) =>
      hub.leaves
        .filter((item) => item.label.toLowerCase().includes(words))
        .map((item) => ({ id: item.id, label: item.label, detail: `${hub.label} · ${item.valueText}`, hub: hub.key, isHub: false }))
    );
    return [...hubs, ...leaves].slice(0, 8);
  }, [graph, query]);

  const needsNaming = !namingCompleted;
  const context = leaf
    ? { label: leaf.label, about: `${leaf.label} in ${detailHub.label.toLowerCase()}` }
    : selectedHub
      ? { label: detailHub.label, about: `my ${detailHub.label.toLowerCase()}` }
      : null;

  const toolButton = "flex h-9 w-9 items-center justify-center rounded-lg text-[#e3e8eb]/75 hover:bg-[#e3e8eb]/8 hover:text-[#e3e8eb] disabled:opacity-35";

  return (
    <div
      data-lenis-prevent
      role="dialog"
      aria-modal={!docked}
      aria-label={`${displayName} — money map`}
      className={cn(
        "kg-dark-world fixed z-[80]",
        docked
          ? "pointer-events-none inset-x-0 bottom-0 flex justify-center !bg-none !bg-transparent p-3 sm:inset-y-0 sm:left-auto sm:right-0 sm:items-end sm:p-5"
          : "inset-0 flex flex-col animate-fade-in-up"
      )}
    >
      {!docked ? (
        <header className="flex shrink-0 items-center gap-2 px-3 py-2 sm:px-5 sm:py-3">
          <KgMark className="h-7 w-7 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold leading-tight">{displayName}</p>
            <p className="truncate text-[11px] text-[#e3e8eb]/55">Money map · {graph.monthLabel}</p>
          </div>

          <div className="ml-2 hidden rounded-lg border border-[var(--ws-edge)] p-0.5 sm:flex" role="group" aria-label="Whose money">
            {(["kushvanth", "g"] as const).map((who) => (
              <button
                key={who}
                type="button"
                aria-pressed={person === who}
                onClick={() => {
                  setPerson(who);
                  clear();
                }}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] font-medium",
                  person === who ? "bg-[var(--ws-gold)]/18 text-[#f3d9a4]" : "text-[#e3e8eb]/60 hover:text-[#e3e8eb]"
                )}
              >
                {PERSON_LABELS[who]}
              </button>
            ))}
          </div>

          {wide ? (
            <div className="mx-auto flex items-center gap-1.5">
              <div className="ws-panel flex rounded-xl p-0.5">
                <button
                  type="button"
                  className={cn(toolButton, view === "universe" && "!bg-[var(--ws-gold)]/16 !text-[#f3d9a4]")}
                  onClick={backToUniverse}
                  aria-label="Whole map"
                  aria-pressed={view === "universe"}
                >
                  <Orbit className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(toolButton, view === "focus" && "!bg-[var(--ws-gold)]/16 !text-[#f3d9a4]")}
                  onClick={() => selectHub(selectedHub ?? detailHubKey)}
                  aria-label="Open the chosen hub"
                  aria-pressed={view === "focus"}
                >
                  <Network className="h-4 w-4" />
                </button>
              </div>
              <div className="ws-panel flex rounded-xl p-0.5">
                <button type="button" className={toolButton} onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.2).toFixed(1)))} disabled={view !== "universe"} aria-label="Zoom in">
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button type="button" className={toolButton} onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} disabled={view !== "universe"} aria-label="Zoom out">
                  <ZoomOut className="h-4 w-4" />
                </button>
              </div>
              <button type="button" className={cn("ws-panel !h-10 !w-10 rounded-xl", toolButton)} onClick={() => ask(BRIEFING)} aria-label="Briefing">
                <Sparkles className="h-4 w-4 text-[var(--ws-gold)]" />
              </button>
            </div>
          ) : (
            <div className="ml-auto" />
          )}

          <div className="flex items-center gap-1">
            <button type="button" className={toolButton} onClick={() => setSearchOpen((open) => !open)} aria-label="Find on the map" aria-expanded={searchOpen}>
              <Search className="h-4 w-4" />
            </button>
            {wide ? (
              <button
                type="button"
                onClick={() => {
                  void chat.handleNewChat();
                  clear();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ws-gold)]/60 px-3 py-1.5 text-[12px] font-medium text-[#f3d9a4] hover:bg-[var(--ws-gold)]/10"
              >
                <Plus className="h-3.5 w-3.5" /> New chat
              </button>
            ) : null}
            {voiceBusy ? (
              <button type="button" className={toolButton} onClick={() => setDocked(true)} aria-label="Shrink to a corner and keep talking">
                <Minimize2 className="h-4 w-4" />
              </button>
            ) : null}
            <button type="button" className={toolButton} onClick={closeAssistant} aria-label={`Close ${displayName}`}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
      ) : null}

      <div className={docked ? "contents" : "relative flex min-h-0 flex-1 flex-col lg:flex-row"}>
        {!docked ? (
          // The map is the stage: all of the screen above the question box on a
          // phone, everything left of the panel on a computer.
          <section className="relative min-h-0 flex-1 overflow-hidden lg:min-w-0" aria-label="Money map">
            {focusHub ? (
              <FocusFan
                key={focusHub.key}
                hub={focusHub}
                personLabel={graph.core.label}
                activity={activity}
                selectedLeaf={selectedLeaf}
                compact={!wide}
                onSelectLeaf={selectLeaf}
                onBack={backToUniverse}
              />
            ) : (
              <MoneyUniverse
                graph={graph}
                activity={mapActivity}
                selectedHub={selectedHub}
                selectedLeaf={selectedLeaf}
                zoom={zoom}
                compact={!wide}
                focus={tourFocus}
                insetLeft={cardShown && wide ? CARD_INSET_WIDE : 0}
                insetBottom={cardShown && !wide ? CARD_INSET_PHONE : 0}
                onSelectHub={selectHub}
                onSelectLeaf={selectLeaf}
              />
            )}

            {cardShown ? (
              <AnswerTourCard
                stops={tour?.stops ?? []}
                index={tour?.index ?? 0}
                playing={tour?.playing ?? false}
                run={tour?.run ?? 0}
                reply={tour?.reply ?? ""}
                labels={mapLabels}
                thinking={thinkingText}
                className={wide ? "absolute left-4 top-1/2 z-10 w-[360px] -translate-y-1/2" : "absolute inset-x-2 bottom-2 z-10"}
                onPrev={() => step(-1)}
                onNext={() => step(1)}
                onTogglePlay={() => setTour((current) => current && { ...current, playing: !current.playing, run: current.run + 1 })}
                onReplay={() => setTour((current) => current && { ...current, index: 0, playing: true, run: current.run + 1 })}
                onClose={() => setTour(null)}
              />
            ) : null}

            {/* On a phone the details are a sheet over the map, opened by choosing something on it. */}
            {!wide && (selectedHub || leaf) && !cardShown ? (
              <div className="ws-panel absolute inset-x-0 bottom-0 z-10 flex max-h-[52%] flex-col rounded-t-3xl" role="region" aria-label={`${detailHub.label} details`}>
                <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-1 pt-2.5">
                  <span className="mx-auto h-1 w-9 rounded-full bg-[#e3e8eb]/20" aria-hidden />
                </div>
                <div className="flex shrink-0 items-center justify-between gap-2 px-4">
                  <p className="min-w-0 truncate text-[12px] text-[#e3e8eb]/70">
                    {graph.core.label} · {detailHub.label}
                    {leaf ? ` · ${leaf.label}` : ""}
                  </p>
                  <button type="button" onClick={backToUniverse} className={toolButton} aria-label="Close the details">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1" data-lenis-prevent>
                  <DetailPanel hub={detailHub} leaf={leaf} activity={activity} assistantName={displayName} onAsk={ask} onLeave={closeAssistant} />
                </div>
              </div>
            ) : null}

            {searchOpen ? (
              <div className="ws-panel absolute left-1/2 top-2 z-20 w-[min(92%,22rem)] -translate-x-1/2 rounded-xl p-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find an account, category, bill…"
                  className="w-full rounded-lg bg-[#e3e8eb]/8 px-3 py-2 text-[13px] outline-none placeholder:text-[#e3e8eb]/40"
                  aria-label="Find on the map"
                />
                {results.length > 0 ? (
                  <ul className="mt-1 max-h-64 overflow-y-auto">
                    {results.map((result) => {
                      const Icon = HUB_ICON[result.hub];
                      return (
                        <li key={result.id}>
                          <button
                            type="button"
                            onClick={() => {
                              if (result.isHub) selectHub(result.hub);
                              else {
                                selectLeaf(result.id);
                                setView("focus");
                              }
                              setSearchOpen(false);
                              setQuery("");
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#e3e8eb]/8"
                          >
                            <Icon className="h-3.5 w-3.5 text-[var(--ws-gold)]" />
                            <span className="min-w-0 flex-1 truncate text-[13px]">{result.label}</span>
                            <span className="shrink-0 text-[11px] text-[#e3e8eb]/50">{result.detail}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : query.trim() ? (
                  <p className="px-2 py-2 text-[12px] text-[#e3e8eb]/50">Nothing on the map is called that.</p>
                ) : null}
              </div>
            ) : null}

            {!wide && !focusHub ? (
              <div className="absolute left-2 top-2 flex rounded-lg border border-[var(--ws-edge)] bg-[#020404]/70 p-0.5" role="group" aria-label="Whose money">
                {(["kushvanth", "g"] as const).map((who) => (
                  <button
                    key={who}
                    type="button"
                    aria-pressed={person === who}
                    onClick={() => {
                      setPerson(who);
                      clear();
                    }}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-medium",
                      person === who ? "bg-[var(--ws-gold)]/18 text-[#f3d9a4]" : "text-[#e3e8eb]/60"
                    )}
                  >
                    {PERSON_LABELS[who]}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <aside
          className={
            docked
              ? "pointer-events-auto flex max-h-[min(70dvh,560px)] w-full max-w-md flex-col rounded-3xl ws-panel p-3 shadow-2xl sm:w-[24rem]"
              : wide
                ? "relative flex min-h-0 flex-col border-l border-[var(--ws-edge)] lg:w-[420px] lg:flex-none xl:w-[460px]"
                : "relative flex shrink-0 flex-col border-t border-[var(--ws-edge)]"
          }
        >
          {!docked && wide ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3 sm:px-5" data-lenis-prevent>
              <p className="mb-3 inline-flex max-w-full items-center gap-1.5 truncate rounded-xl border border-[var(--ws-edge)] px-3 py-1.5 text-[12px] text-[#e3e8eb]/75">
                {graph.core.label} · {detailHub.label}
                {leaf ? ` · ${leaf.label}` : ""}
                {!selectedHub && !leaf && activity.activeHubs.length ? " · what I'm looking at" : ""}
              </p>
              <DetailPanel
                hub={detailHub}
                leaf={leaf}
                activity={activity}
                assistantName={displayName}
                onAsk={ask}
                onLeave={closeAssistant}
              />
            </div>
          ) : null}

          <div className={docked ? "flex min-h-0 flex-1 flex-col" : "shrink-0 border-t border-[var(--ws-edge)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-4"}>
            {docked ? (
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[12px] font-semibold">{displayName} · keep talking</p>
                <button
                  type="button"
                  onClick={() => setDocked(false)}
                  className="rounded-full border border-[var(--ws-edge)] px-2.5 py-1 text-[11px] font-semibold text-[#e3e8eb]/80"
                >
                  Open map
                </button>
              </div>
            ) : null}
            {needsNaming ? (
              <div className="max-h-[60dvh] overflow-y-auto">
                <AssistantNameSetup
                  onComplete={() => {
                    if (autoStartVoice) setMode("voice");
                  }}
                />
              </div>
            ) : (
              <WorkspaceConversation
                chat={chat}
                mode={mode}
                onModeChange={setMode}
                assistantName={displayName}
                voiceGender={voiceGender}
                autoStartVoice={autoStartVoice}
                onAutoStartHandled={clearAutoStart}
                onVoiceBusy={(busy) => {
                  setVoiceBusy(busy);
                  onVoiceLiveChange?.(busy);
                  if (!busy) setDocked(false);
                }}
                onActivity={onActivity}
                context={context}
                onAnalyse={analyse}
                expanded={expanded}
                onExpandedChange={setExpanded}
                hideFolded={cardShown}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
