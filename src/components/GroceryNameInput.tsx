"use client";

import { useCallback, useEffect, useId, useRef, useState, type Ref } from "react";
import { autoUpdate, flip, FloatingPortal, offset, shift, size, useFloating, useMergeRefs } from "@floating-ui/react";
import { useApp } from "@/contexts/AppContext";
import { normalizeGroceryName } from "@/utility/groceryCategory";
import { canSuggestGroceryName, groceryNameSuggestions } from "@/utility/grocerySuggestions";
import type { GroceryNameHistoryCandidate } from "@/types/grocerySuggestions";

type Props = { value: string; onChange: (name: string) => void; label: string; disabled: boolean; groupId?: string; inputRef?: Ref<HTMLInputElement>; className?: string };

export function GroceryNameInput(props: Props) {
  const { snapshot } = useApp();
  // Discard all local history and pending reads when the authorized scope changes.
  return <GroceryNameInputSession key={`${snapshot.userId}:${props.groupId ?? "personal"}`} {...props} />;
}

function GroceryNameInputSession({ value, onChange, label, disabled, groupId, inputRef, className = "" }: Props) {
  const { actions } = useApp();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const loader = useRef(actions.loadGroceryNameSuggestions);
  useEffect(() => { loader.current = actions.loadGroceryNameSuggestions; }, [actions.loadGroceryNameSuggestions]);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [composing, setComposing] = useState(false);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<{ query: string; items: GroceryNameHistoryCandidate[]; error: boolean } | null>(null);
  const query = normalizeGroceryName(value);
  const eligible = canSuggestGroceryName(value);
  useEffect(() => {
    if (!focused || !eligible || composing || dismissed || disabled) return;
    let active = true;
    const timer = setTimeout(() => {
      if (!loader.current) return;
      void loader.current(query, groupId).then(items => { if (active) setRead({ query, items, error: false }); })
        .catch(() => { if (active) setRead({ query, items: [], error: true }); });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [query, groupId, focused, eligible, composing, dismissed, disabled, attempt]);
  const history = read?.query === query ? read.items : [];
  const suggestions = groceryNameSuggestions(value, history);
  const open = focused && eligible && !composing && !dismissed && !disabled && suggestions.length > 0;
  const activeIndex = suggestions.findIndex(item => normalizeGroceryName(item.name) === activeName);
  const { refs, floatingStyles } = useFloating({
    open, placement: "bottom-start", strategy: "fixed", whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 }), size({ padding: 8, apply({ availableHeight, availableWidth, rects, elements }) {
      Object.assign(elements.floating.style, { width: `${Math.min(rects.reference.width, availableWidth)}px`, maxHeight: `${Math.max(0, Math.min(320, availableHeight))}px` });
    } })],
  });
  const setReference = useCallback((node: HTMLInputElement | null) => {
    input.current = node;
    refs.setReference(node);
  }, [refs]);
  const mergedRef = useMergeRefs([setReference, inputRef]);
  useEffect(() => {
    if (open && activeIndex >= 0) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, id]);
  function choose(name: string) {
    setDismissed(true); setActiveName(null); if (name !== value) onChange(name); input.current?.focus();
  }
  const failed = read?.query === query && read.error;
  return <div className={`min-w-0 ${className}`}>
    <input ref={mergedRef} id={id} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
      aria-describedby={failed ? `${id}-history-error` : undefined} autoComplete="off" placeholder="Item" className="input w-full" value={value} disabled={disabled} maxLength={256}
      onFocus={() => { setFocused(true); setDismissed(false); }} onBlur={() => { setFocused(false); setActiveName(null); }}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
      onChange={event => { setDismissed(false); setActiveName(null); onChange(event.target.value); }}
      onKeyDown={event => {
        if (composing || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && eligible && suggestions.length) {
          event.preventDefault(); setDismissed(false);
          const next = event.key === "ArrowDown" ? (activeIndex + 1) % suggestions.length : (activeIndex < 0 ? suggestions.length - 1 : (activeIndex + suggestions.length - 1) % suggestions.length);
          setActiveName(normalizeGroceryName(suggestions[next].name));
        } else if (event.key === "Enter" && open) {
          event.preventDefault(); event.stopPropagation();
          if (activeIndex >= 0) choose(suggestions[activeIndex].name); else setDismissed(true);
        } else if (event.key === "Escape" && open) {
          event.preventDefault(); event.stopPropagation(); setDismissed(true); setActiveName(null);
        } else if (event.key === "Tab") { setDismissed(true); setActiveName(null); }
      }} />
    {open ? <FloatingPortal><div ref={node => refs.setFloating(node)} style={floatingStyles} className="z-60 overflow-y-auto overscroll-contain rounded-xl border border-lav-200 bg-white p-1 text-ink shadow-card">
      <ul id={`${id}-list`} role="listbox" aria-label="Grocery item suggestions">
        {suggestions.map((item, index) => <li key={normalizeGroceryName(item.name)} id={`${id}-option-${index}`} role="option" aria-selected={index === activeIndex} tabIndex={-1}
          className={`flex min-h-[44px] cursor-pointer items-center break-words rounded-lg px-3 py-2 text-sm font-semibold [overflow-wrap:anywhere] ${index === activeIndex ? "bg-lav-100" : "hover:bg-cream"}`}
          onPointerDown={event => event.preventDefault()} onPointerMove={() => setActiveName(normalizeGroceryName(item.name))} onClick={() => choose(item.name)}>{item.name}</li>)}
      </ul>
    </div></FloatingPortal> : null}
    {failed ? <div id={`${id}-history-error`} className="mt-1 flex flex-wrap items-center gap-x-2 text-xs"><span>Past items unavailable. You can still add an item.</span><button type="button" disabled={disabled} className="min-h-[44px] font-bold underline underline-offset-2" onClick={() => { setAttempt(value => value + 1); setDismissed(false); input.current?.focus(); }}>Retry past items</button></div> : null}
  </div>;
}
