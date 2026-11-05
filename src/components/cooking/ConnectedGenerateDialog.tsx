"use client";

import type { ComponentProps } from "react";
import { GenerateWeekDialog } from "@/components/nutrition/GenerateWeekDialog";
import { GroupGenerateDialog } from "./GroupGenerateDialog";
import { useCookingGroup } from "./useCookingGroup";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";

export function ConnectedGenerateDialog(props: ComponentProps<typeof GenerateWeekDialog>) {
  const group = useCookingGroup(props.weekOf);
  if (group.loading || group.error && !group.data?.group) return <Modal open title="Generate plan" returnFocus={props.returnFocus} onClose={props.onClose}
    footer={<div className="flex flex-wrap gap-2"><Button variant="soft" onClick={props.onClose}>Close</Button>{group.error ? <Button disabled={group.refreshing} onClick={group.refresh}>Retry connection</Button> : null}</div>}>
    {group.loading || group.refreshing ? <LoadingIndicator label="Loading cooking group…" /> : <p className="text-danger-900" role="alert">{group.error}</p>}
  </Modal>;
  if (group.data?.group) return <GroupGenerateDialog week={group.data} returnFocus={props.returnFocus} onClose={props.onClose} />;
  return <GenerateWeekDialog {...props} />;
}
