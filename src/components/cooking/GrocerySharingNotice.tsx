export function GrocerySharingNotice({ inviting = false }: { inviting?: boolean }) {
  return <p className="text-sm text-ink-soft">{inviting ? "Generating a PIN shares" : "This shares"} all your saved and future groceries with this group and adds your recorded spending once. {inviting ? "People who join can access them. " : ""}Shared groceries and spending stay with the group if you leave. Unsaved drafts need separate review.</p>;
}
