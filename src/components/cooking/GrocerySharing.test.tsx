import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { GrocerySharing } from "./GrocerySharing";
import { GrocerySharingNotice } from "./GrocerySharingNotice";
import type { GroupWeek } from "@/types/cookingGroup";
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ actions: {} }) }));
vi.mock("@/components/ui/Modal", () => ({ Modal: ({ title, children, footer }: {title:string;children:ReactNode;footer:ReactNode}) => <section role="dialog" aria-label={title}>{children}{footer}</section> }));
const week: GroupWeek = { weekOf:"2026-10-25", group:{ id:"group",revision:1,weekStartsOn:0,proposal:null,members:[{id:"alice",name:"Alice",joinedAt:"2026-10-01"}] }, recipes:[],assignments:[],grocery:null,generation:null,notices:[],revision:0 };
const render = (value: GroupWeek, presentation: "grocery" | "settings" = "grocery") => renderToStaticMarkup(<GrocerySharing week={value} presentation={presentation} locked={false} refresh={vi.fn()} onSavingChange={vi.fn()} />);
describe("grocery sharing consent", () => {
  it("uses a one-time dialog without a checkbox or large card", () => {
    const html = render({...week,grocerySharing:{status:"not-enabled",remaining:4,completed:0}});
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Share groceries with your group');
    expect(html).toContain('Shared with Alice');
    expect(html).toContain('all your saved and future groceries');
    expect(html).toContain('adds your recorded spending once');
    expect(html).toContain('Not now');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('One grocery list for your group');
  });
  it("keeps a dismissed prompt off Groceries and recoverable in Settings", () => {
    const value = {...week,grocerySharing:{status:"not-enabled" as const,promptDismissed:true,remaining:4,completed:0}};
    expect(render(value)).toBe("");
    expect(render(value,"settings")).toContain('Enable grocery sharing');
    expect(render(value,"settings")).not.toContain('role="dialog"');
  });
  it("shows compact transfer feedback without another consent prompt", () => {
    const html = render({...week,grocerySharing:{status:"transferring",remaining:2,completed:3}});
    expect(html).toContain('Resume grocery transfer');
    expect(html).toContain('2 saved weeks left to share.');
    expect(html).not.toContain('role="dialog"');
  });
  it("renders nothing after confirmed sharing", () => {
    expect(render({...week,grocerySharing:{status:"enabled",remaining:0,completed:5}})).toBe("");
  });
  it("discloses the inviter's sharing before PIN generation", () => {
    const html = renderToStaticMarkup(<GrocerySharingNotice inviting />);
    expect(html).toContain('Generating a PIN shares');
    expect(html).toContain('People who join can access them.');
    expect(html).toContain('stay with the group if you leave');
    expect(html).toContain('Unsaved drafts need separate review.');
  });
});
