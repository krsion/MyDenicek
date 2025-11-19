import { PrimaryButton } from "@fluentui/react";
import { Card, Input, Field } from "@fluentui/react-components";
import { useCallback, useState, useEffect } from "react";

export function ValueForm({ selectedNodeGuid, onSubmit, label, buttonText }: { selectedNodeGuid: string | null; onSubmit: (value: string) => void; label: string; buttonText: string; }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    // When selection changes, try to populate the current node's text content as a convenience.
    if (!selectedNodeGuid) {
      setValue("");
      return;
    }
    const el = document.querySelector(`[data-node-guid='${selectedNodeGuid}']`) as HTMLElement | null;
    if (!el) {
      setValue("");
      return;
    }
    // Use innerText as the editable value (this reflects rendered content)
    setValue((el.innerText || "").replace(/\s+/g, " ").trim());
  }, [selectedNodeGuid]);

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
    <Card>
      <Field label={label} orientation="vertical" hint={"Edit text content for the selected node"}>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Text content" />
      </Field>
      <PrimaryButton disabled={!selectedNodeGuid} onClick={onClick}>{buttonText}</PrimaryButton>
    </Card>
  );
}
