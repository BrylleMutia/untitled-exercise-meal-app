"use client";

import type { ComponentProps } from "react";
import { GenerateWeekDialog } from "@/components/nutrition/GenerateWeekDialog";
import { GroupGenerateDialog } from "./GroupGenerateDialog";
import { useCookingGroup } from "./useCookingGroup";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function ConnectedGenerateDialog(props: ComponentProps<typeof GenerateWeekDialog>) {
  const group = useCookingGroup(props.weekOf);
  if (group.loading || group.error) return <Modal open title="Generate plan" returnFocus={props.returnFocus} onClose={props.onClose}
    footer={<div className="flex flex-wrap gap-2"><Button variant="soft" onClick={props.onClose}>Close</Button>{group.error ? <Button onClick={group.refresh}>Retry connection</Button> : null}</div>}>
    <p className={group.error ? "text-danger-900" : undefined} role={group.error ? "alert" : "status"}>{group.error ?? "Checking cooking group…"}</p>
  </Modal>;
  if (group.data?.group) return <GroupGenerateDialog week={group.data} returnFocus={props.returnFocus} onClose={props.onClose} />;
  return <GenerateWeekDialog {...props} />;
}
