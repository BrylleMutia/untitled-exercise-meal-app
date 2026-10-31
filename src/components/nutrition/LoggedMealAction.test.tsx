import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoggedMealAction } from "./LoggedMealAction";
import type { DailyMealRow } from "@/utility/dailyMealRows";

vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ actions: {}, pendingMutation: null }) }));
const row: DailyMealRow = { id: "saved", slot: "dinner", name: "Chicken rice", calories: 609, partial: false, logged: true, log: { kind: "meal", id: "saved", revision: 1 } };

it("makes the logged checkmark an accessible 44px undo button with mint styling", () => {
  const html = renderToStaticMarkup(<LoggedMealAction row={row} disabled={false} onUndone={() => {}} />);
  expect(html).toContain('aria-label="Undo logged Chicken rice"');
  expect(html).toContain("!h-[44px] !w-[44px]");
  expect(html).toContain("bg-mint-100");
  expect(html).not.toContain('disabled=""');
  expect(html).not.toContain(">Logged</span>");
});
it("locks undo during another action or without a resolved log identity", () => {
  expect(renderToStaticMarkup(<LoggedMealAction row={row} disabled onUndone={() => {}} />)).toContain('disabled=""');
  expect(renderToStaticMarkup(<LoggedMealAction row={{ ...row, log: undefined }} disabled={false} onUndone={() => {}} />)).toContain('disabled=""');
});

it("uses a full circular icon treatment only for meal entries", () => {
  const html = renderToStaticMarkup(<LoggedMealAction row={row} disabled={false} onUndone={() => {}} appearance="meal-entry" />);
  expect(html).toContain('aria-label="Undo logged Chicken rice"');
  expect(html).toContain("!rounded-full !bg-mint-100"); expect(html).not.toContain("h-[32px]");
  const home = renderToStaticMarkup(<LoggedMealAction row={row} disabled={false} onUndone={() => {}} />);
  expect(home).toContain("h-[32px]"); expect(home).toContain("bg-transparent");
});
