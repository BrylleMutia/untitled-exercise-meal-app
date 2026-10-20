"use client";
import { useState, type ComponentProps } from "react";
import { GenerateWeekDialog } from "@/components/nutrition/GenerateWeekDialog";
import { GroupGenerateDialog } from "./GroupGenerateDialog";
import { useCookingGroup } from "./useCookingGroup";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function ConnectedGenerateDialog(props: ComponentProps<typeof GenerateWeekDialog>) {
  const group = useCookingGroup(props.weekOf); const [personal, setPersonal] = useState(false);
  if (!personal && (group.loading || group.error)) return <Modal open title="Generate plan" returnFocus={props.returnFocus} onClose={props.onClose} footer={<div className="flex flex-wrap gap-2"><Button variant="soft" onClick={props.onClose}>Close</Button>{group.error ? <><Button onClick={group.refresh}>Retry connection</Button><Button variant="soft" onClick={() => setPersonal(true)}>Plan for my account only</Button></> : null}</div>}><p role={group.error ? "alert" : "status"}>{group.error ?? "Checking cooking group…"}</p></Modal>;
  if (group.data?.group && !personal) return <GroupGenerateDialog week={group.data} returnFocus={props.returnFocus} onClose={props.onClose} onPersonal={() => setPersonal(true)} />;
  return <GenerateWeekDialog {...props} />;
}
