import { Stack, PrimaryButton } from "@fluentui/react";
import { Card, Label, Input } from "@fluentui/react-components";
import { useState } from "react";

export function WrapForm({ selectedNodeGuid, onSubmit }: { selectedNodeGuid: string | null; onSubmit: (tag: string) => void; }) {

  const [wrapTag, setWrapTag] = useState("div");

  return (
    <Card>
      <Stack horizontal tokens={{ childrenGap: 8 }}>
        <Label>Wrap in</Label>
        <Input
          value={wrapTag}
          onChange={(e) => setWrapTag(e.target.value)}
          placeholder="e.g. div" />
        <PrimaryButton disabled={!selectedNodeGuid} onClick={() => {
          const tag = wrapTag.trim().toLowerCase();
          if (!selectedNodeGuid) {
            return;
          }
          if (!tag || !/^[a-z][a-z0-9-]*$/.test(tag)) {
            return;
          }
          onSubmit(tag);
          // After render click on the wrapped element to select it
          setTimeout(() => {
            const el = document.querySelector(`[data-node-guid='${selectedNodeGuid}']`) as HTMLElement | null;
            el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          }, 0);
        }}>
          Wrap
        </PrimaryButton>
      </Stack>
      <Label size="small">Common tags: div, section, article, span, p</Label>
    </Card>
  );
}
