import { PrimaryButton } from "@fluentui/react";
import { Card, Field, Input } from "@fluentui/react-components";
import { useCallback, useEffect, useState } from "react";

export function ValueForm({ selectedNodeGuid, currentValue, onSubmit, label, buttonText }: { selectedNodeGuid: string | null; currentValue?: string | number; onSubmit: (value: string) => void; label: string; buttonText: string; }) {
  const [value, setValue] = useState(currentValue === undefined || currentValue === null ? "" : String(currentValue));

  useEffect(() => {
    if (currentValue === undefined || currentValue === null) {
      setValue("");
    } else {
      setValue(String(currentValue));
    }
  }, [selectedNodeGuid, currentValue]);

  const onClick = useCallback(() => {
    if (!selectedNodeGuid) return;
    onSubmit(value);
    // Reselect element after update
    setTimeout(() => {
      const el = document.querySelector(`[data-node-guid='${selectedNodeGuid}']`) as HTMLElement | null;
      el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, 0);
  }, [selectedNodeGuid, value, onSubmit]);

  return (
    <Card style={{ minWidth: 240}}>
      <Field label={label} orientation="vertical" hint={"Edit text content for the selected node"}>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Text content" />
      </Field>
      <PrimaryButton disabled={!selectedNodeGuid} onClick={onClick}>{buttonText}</PrimaryButton>
    </Card>
  );
}
