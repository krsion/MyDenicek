import { PrimaryButton } from "@fluentui/react";
import { Card, Input, Field } from "@fluentui/react-components";
import { useCallback, useState } from "react";

export function TagForm({ selectedNodeGuid, onSubmit, label, buttonText }: { selectedNodeGuid: string | null; onSubmit: (tag: string) => void; label: string; buttonText: string; }) {

  const [tag, setTag] = useState("div");

  const onClick = useCallback(() => {
    const normalizedTag = tag.trim().toLowerCase();
    if (!selectedNodeGuid) {
      return;
    }
    if (!normalizedTag || !/^[a-z][a-z0-9-]*$/.test(normalizedTag)) {
      return;
    }
    onSubmit(normalizedTag);
    // After render click on the wrapped element to select it
    setTimeout(() => {
      const el = document.querySelector(`[data-node-guid='${selectedNodeGuid}']`) as HTMLElement | null;
      el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, 0);
  }, [selectedNodeGuid, tag, onSubmit]);

  return (
    <Card style={{ minWidth: 240 }}>
      <Field label={label} orientation="vertical" hint={"Common tags: div, section, article, span, p"}>
        <Input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="e.g. div" />
      </Field>
      <PrimaryButton disabled={!selectedNodeGuid} onClick={onClick}>
        {buttonText}
      </PrimaryButton>
    </Card>
  );
}
