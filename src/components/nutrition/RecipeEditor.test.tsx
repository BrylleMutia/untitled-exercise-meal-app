import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { Meal } from "@/types/domain";
import { RecipeEditor } from "./RecipeEditor";

vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ snapshot: { userId: "editor-test", grocery: null, savedMeals: [] }, pendingMutation: null }) }));
vi.mock("@/components/ui/Modal", () => ({ Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <section>{children}{footer}</section> }));
const recipe = (overrides: Partial<Meal> = {}): Meal => ({ id: "owned", name: "Saved supper", servings: 4, ingredients: [], ...overrides });
const render = (meal?: Meal, callbacks = true) => renderToStaticMarkup(<RecipeEditor open meal={meal} foods={[]} returnFocus={{ current: null }} onSave={async () => true} onSaved={() => {}} onCancel={() => {}} {...(callbacks ? { onArchive: async () => true, onArchived: () => {} } : {})} />);

describe("recipe editor archive eligibility", () => {
  it("orders Archive before Cancel and Save changes for eligible personal and catalog recipes", () => {
    for (const meal of [recipe(), recipe({ id: "default", isSystem: true })]) {
      const html = render(meal);
      expect(html).not.toContain("Archiving hides this saved recipe from Recipes.");
      expect(html).toContain("bg-danger-200 text-danger-900");
      expect(html).toContain('aria-label="Archive recipe"');
      expect(html).not.toContain("Archive</button>");
      expect(html.indexOf('aria-label="Archive recipe"')).toBeLessThan(html.indexOf("Cancel</button>"));
      expect(html.indexOf("Cancel</button>")).toBeLessThan(html.indexOf("Save changes</button>"));
    }
  });
  it("does not expose archive for creation, archived records, retained copies or missing authorization callbacks", () => {
    for (const html of [render(), render(recipe({ archivedAt: "archived" })), render(recipe({ id: "group-copy-retained" })), render(recipe(), false)]) {
      expect(html).not.toContain('aria-label="Archive recipe"');
      expect(html).not.toContain("Archiving hides this saved recipe");
    }
  });
});
