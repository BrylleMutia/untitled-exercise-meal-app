"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ListChecks, ListX, RotateCcw, X } from "lucide-react";
import { Button } from "./Button";
import { swipeDecision, type SwipeDecision } from "@/utility/cardSwiper";

export type SwiperItem<T> = { id: string; label: string; selected: boolean; value: T; canAdd?: boolean };
type History<T> = { id: string; value: T; previous?: SwipeDecision };
type Deck<T> = { basis: string; currentId: string | null; decisions: Record<string, SwipeDecision>; history: History<T>[] };
const interactive = "button,input,select,textarea,a,summary,[contenteditable=true],[role=button]";
const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(notify: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const motionSnapshot = () => window.matchMedia(motionQuery).matches;
const serverMotion = () => true;

export function CardSwiper<T>({ items, basisKey, active, disabled, renderCard, renderThumbnail, onDecision, onUndo, onSelectAll, onClear }: {
  items: SwiperItem<T>[]; basisKey: string; active: boolean; disabled: boolean;
  renderCard: (item: SwiperItem<T>) => ReactNode;
  renderThumbnail: (item: SwiperItem<T>) => ReactNode;
  onDecision: (id: string, decision: SwipeDecision) => void;
  onUndo: (id: string, value: T) => void;
  onSelectAll: () => void; onClear: () => void;
}) {
  const freshDeck = (): Deck<T> => ({ basis: basisKey, currentId: items.find(item => !item.selected)?.id ?? null, decisions: {}, history: [] });
  const [deck, setDeck] = useState<Deck<T>>(freshDeck);
  const [hint, setHint] = useState<SwipeDecision | null>(null);
  const [highlight, setHighlight] = useState<SwipeDecision | null>(null);
  const [exiting, setExiting] = useState(false);
  const [leaving, setLeaving] = useState<SwiperItem<T> | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reducedMotion = useSyncExternalStore(subscribeMotion, motionSnapshot, serverMotion);
  const card = useRef<HTMLDivElement>(null), actions = useRef<HTMLDivElement>(null);
  const reviewSummary = useRef<HTMLElement>(null);
  const seenHint = useRef(false), locked = useRef(false);
  const hintTimers = useRef<ReturnType<typeof setTimeout>[]>([]), exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; locked: boolean } | null>(null);
  const instructionId = useId(), countId = useId();
  if (deck.basis !== basisKey) setDeck(freshDeck());
  const current = deck.basis !== basisKey ? undefined : exiting && leaving && items.some(item => item.id === leaving.id) ? leaving : items.find(item => item.id === deck.currentId);
  const currentId = current?.id;
  const blocked = disabled || !active || exiting;
  const direction = !blocked ? highlight ?? hint : null;
  const stopHint = useCallback((interacted = false) => {
    if (interacted) seenHint.current = true;
    hintTimers.current.forEach(clearTimeout); hintTimers.current = [];
    setHint(null);
  }, []);
  const resetDrag = useCallback(() => {
    const previous = drag.current; drag.current = null;
    if (previous && card.current?.hasPointerCapture(previous.pointerId)) card.current.releasePointerCapture(previous.pointerId);
    card.current?.style.removeProperty("transform"); card.current?.style.removeProperty("transition");
    setHighlight(null);
  }, []);
  useEffect(() => () => {
    stopHint(); resetDrag(); locked.current = false;
    if (exitTimer.current) clearTimeout(exitTimer.current);
    setExiting(false); setLeaving(null);
  }, [active, disabled, basisKey, stopHint, resetDrag]);

  useEffect(() => {
    if (!active || disabled || reducedMotion || !currentId || seenHint.current || !card.current || !actions.current) return;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) { if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target); }
      if (visible.size !== 2 || seenHint.current) return;
      seenHint.current = true;
      hintTimers.current = [
        setTimeout(() => setHint("skip"), 250), setTimeout(() => setHint(null), 850),
        setTimeout(() => setHint("add"), 1150), setTimeout(() => setHint(null), 1750),
      ];
    });
    observer.observe(card.current); observer.observe(actions.current);
    const hide = () => { if (document.hidden) stopHint(); };
    document.addEventListener("visibilitychange", hide);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", hide); stopHint(); };
  }, [active, disabled, reducedMotion, currentId, basisKey, stopHint]);

  function decide(decision: SwipeDecision) {
    if (!current || blocked || locked.current) return;
    stopHint(true);
    if (decision === "add" && current.canAdd === false) { resetDrag(); setAnnouncement("Check this recipe’s quantity before adding it."); return; }
    locked.current = true; setLeaving(current); setExiting(true); setHighlight(decision);
    const decisions = { ...deck.decisions, [current.id]: decision };
    const index = items.indexOf(current);
    const next = [...items.slice(index + 1), ...items.slice(0, index)].find(item => !decisions[item.id] && !item.selected);
    const nextDeck = { ...deck, currentId: next?.id ?? null, decisions, history: [...deck.history, { id: current.id, value: current.value, previous: deck.decisions[current.id] }] };
    setDeck(nextDeck);
    onDecision(current.id, decision);
    setAnnouncement(`${current.label} ${decision === "add" ? "added" : "skipped"}. ${next ? `Next: ${next.label}.` : "End of recipe deck. Review your choices or continue."}`);
    if (card.current && !reducedMotion) {
      card.current.style.transition = "transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease-out";
      card.current.style.transform = `translateX(${(decision === "skip" ? -1 : 1) * (card.current.offsetWidth + 100)}px) rotate(${decision === "skip" ? -8 : 8}deg)`;
    }
    const finish = () => {
      resetDrag(); setLeaving(null); setExiting(false); locked.current = false; exitTimer.current = null;
      requestAnimationFrame(() => (card.current ?? reviewSummary.current)?.focus({ preventScroll: true }));
    };
    if (reducedMotion) finish(); else exitTimer.current = setTimeout(finish, 220);
  }
  function undo() {
    if (blocked || locked.current) return;
    const last = deck.history.at(-1); if (!last) return;
    stopHint(true); resetDrag(); onUndo(last.id, last.value);
    const decisions = { ...deck.decisions }; if (last.previous) decisions[last.id] = last.previous; else delete decisions[last.id];
    setDeck({ ...deck, currentId: last.id, decisions, history: deck.history.slice(0, -1) });
    setAnnouncement(`Previous choice restored. ${items.find(item => item.id === last.id)?.label ?? "Recipe"} is ready to review.`);
    requestAnimationFrame(() => card.current?.focus({ preventScroll: true }));
  }
  function review(id: string) {
    if (blocked || locked.current) return;
    stopHint(true); resetDrag(); setDeck({ ...deck, currentId: id });
    requestAnimationFrame(() => { card.current?.focus({ preventScroll: true }); card.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); });
  }
  function bulk(all: boolean) {
    if (blocked || locked.current) return;
    stopHint(true); resetDrag(); if (all) onSelectAll(); else onClear();
    setDeck({ basis: basisKey, currentId: all ? null : items[0]?.id ?? null, decisions: {}, history: [] });
    setAnnouncement(all ? "All recipes selected." : "Recipe choices cleared.");
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (blocked || !event.isPrimary || event.button !== 0 || (event.target as Element).closest(interactive)) return;
    stopHint(true); drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, locked: false };
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current; if (!start || start.pointerId !== event.pointerId || blocked) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    if (!start.locked) {
      if (Math.max(Math.abs(x), Math.abs(y)) < 8) return;
      if (Math.abs(y) >= Math.abs(x)) { resetDrag(); return; }
      if (Math.abs(x) < Math.abs(y) * 1.25) return;
      start.locked = true; event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    event.currentTarget.style.transition = "none";
    event.currentTarget.style.transform = `translateX(${x}px) rotate(${reducedMotion ? 0 : Math.max(-8, Math.min(8, x / 22))}deg)`;
    setHighlight(x < 0 ? "skip" : x > 0 ? "add" : null);
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current; if (!start || start.pointerId !== event.pointerId) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    const horizontal = start.locked || Math.abs(x) >= 8 && Math.abs(x) > Math.abs(y) * 1.25;
    const choice = horizontal ? swipeDecision(x, event.currentTarget.offsetWidth) : null;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (choice) decide(choice); else resetDrag();
  }
  return <div className="@container grid min-w-0 gap-4" data-card-swiper onPointerDownCapture={() => stopHint(true)} onKeyDownCapture={() => stopHint(true)} onFocusCapture={() => stopHint(true)}>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <p id={countId} className="text-sm font-extrabold">{current ? `Recipe ${items.indexOf(current) + 1} of ${items.length}` : "Your recipe choices"} <span className="ml-2 font-semibold text-ink-soft">{items.filter(item => item.selected).length} added</span></p>
      <div className="flex gap-1"><Button variant="ghost" className="!min-h-11 min-w-11 !px-2" aria-label="Select all" disabled={blocked || !items.length} onClick={() => bulk(true)}><ListChecks className="h-4 w-4" aria-hidden /></Button><Button variant="ghost" className="!min-h-11 min-w-11 !px-2" aria-label="Clear" disabled={blocked || !items.length} onClick={() => bulk(false)}><ListX className="h-4 w-4" aria-hidden /></Button></div>
    </div>
    {current ? <>
      <div className="overflow-x-clip px-3 pb-3 pt-1">
        <div className="relative mx-auto max-w-md">
          {items.length > 2 ? <span aria-hidden className="pointer-events-none absolute inset-0 translate-x-2 translate-y-2 rotate-2 rounded-2xl border border-ink/15 bg-lav-50" /> : null}
          {items.length > 1 ? <span aria-hidden className="pointer-events-none absolute inset-0 translate-x-1 translate-y-1 rotate-1 rounded-2xl border border-ink/20 bg-white" /> : null}
          <div key={current.id} ref={card} role="region" aria-roledescription="recipe card" aria-label={`Recipe card: ${current.label}`} aria-describedby={`${countId} ${instructionId}`} tabIndex={0}
            data-swiper-card data-hint={hint ?? undefined} aria-busy={exiting} inert={exiting || undefined}
            className="card-swiper-card relative min-w-0 select-none rounded-2xl border border-ink bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lav-500"
            style={{ touchAction: "pan-y pinch-zoom" }} onDragStart={event => event.preventDefault()}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={resetDrag}
            onLostPointerCapture={event => {
              // Touch transfers implicit capture from the image to this card; that child's lost-capture event bubbles here.
              if (event.target === event.currentTarget && drag.current?.pointerId === event.pointerId) resetDrag();
            }}
            onKeyDown={event => { if (event.target !== event.currentTarget || event.repeat) return; if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); decide(event.key === "ArrowLeft" ? "skip" : "add"); } }}>
            {renderCard(current)}
          </div>
        </div>
      </div>
      <div ref={actions} className="mx-auto grid w-full max-w-80 grid-cols-2 gap-6 px-2">
        <button type="button" disabled={blocked} aria-label="Skip recipe" data-swipe-action="skip" data-highlighted={direction === "skip"}
          className={`mx-auto flex aspect-square min-h-24 w-full min-w-0 max-w-32 flex-col items-center justify-center gap-1 rounded-full bg-lav-100 px-2 py-4 text-sm font-extrabold [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:opacity-50 ${direction === "skip" ? "outline-2 outline-offset-4 outline-lav-300" : ""}`} onClick={() => decide("skip")}>
          <span className="flex max-w-full flex-wrap justify-center gap-1" aria-hidden><ArrowLeft className="h-5 w-5" /><X className="h-6 w-6" /></span><span>Skip recipe</span>
        </button>
        <button type="button" disabled={blocked || current.canAdd === false} aria-label="Add recipe" data-swipe-action="add" data-highlighted={direction === "add"}
          className={`mx-auto flex aspect-square min-h-24 w-full min-w-0 max-w-32 flex-col items-center justify-center gap-1 rounded-full bg-mint-100 px-2 py-4 text-sm font-extrabold [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:opacity-50 ${direction === "add" ? "outline-2 outline-offset-4 outline-mint-200" : ""}`} onClick={() => decide("add")}>
          <span className="flex max-w-full flex-wrap justify-center gap-1" aria-hidden><Check className="h-6 w-6" /><ArrowRight className="h-5 w-5" /></span><span>Add recipe</span>
        </button>
      </div>
    </> : <p className="rounded-2xl bg-lav-50 p-4 text-sm">{items.length ? "You’ve reached the end of the deck. Review your choices or continue with the recipes you added." : "No recipes are available. Create a recipe and assign its meals to begin."}</p>}
    <p id={instructionId} className="text-center text-xs font-semibold text-ink-soft">Swipe left to skip · Swipe right to add</p>
    <div className="grid min-w-0 grid-cols-1 items-start gap-2 @min-[20rem]:grid-cols-[auto_minmax(0,1fr)]">
      <Button variant="soft" className="!min-h-11 w-fit max-w-full !px-3 text-xs" disabled={blocked || !deck.history.length} onClick={undo}><RotateCcw className="h-4 w-4 shrink-0" aria-hidden />Undo</Button>
      <details className="w-full min-w-0 rounded-xl border border-ink/15" onToggle={() => stopHint(true)}>
        <summary ref={reviewSummary} className="min-h-11 cursor-pointer content-center break-words rounded-xl px-3 text-sm font-bold [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-lav-500">Review choices ({items.length})</summary>
        <ul aria-label="Recipe choices" className="grid min-w-0 divide-y divide-ink/10 px-3">{items.map(item => <li key={item.id} className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 py-3 @min-[20rem]:grid-cols-[2.5rem_minmax(0,1fr)_auto]">
          <span className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-lg" aria-hidden>{renderThumbnail(item)}</span>
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-bold">{item.label}</p><p className="text-xs text-ink-soft">{item.selected ? "Added" : deck.decisions[item.id] === "skip" ? "Skipped" : "Not reviewed"}</p></div>
          <Button variant="ghost" className="col-start-2 !min-h-11 w-fit min-w-0 max-w-full !px-2 text-xs [overflow-wrap:anywhere] @min-[20rem]:col-start-auto" disabled={blocked} aria-label={`Review ${item.label}`} onClick={() => review(item.id)}>Review</Button>
        </li>)}</ul>
      </details>
    </div>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
  </div>;
}
