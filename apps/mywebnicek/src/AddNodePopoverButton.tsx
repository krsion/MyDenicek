import { Button, Input, Label, Radio, RadioGroup, ToolbarButton, Tooltip } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-popover";
import { type KeyboardEvent, useEffect, useState } from "react";

type Props = {
    disabled: boolean;
    initialValue?: string;
    onAddChild: (content: string, isValue: boolean) => void;
    onAddBefore: (content: string, isValue: boolean) => void;
    onAddAfter: (content: string, isValue: boolean) => void;
};

export const AddNodePopoverButton = ({ disabled, initialValue, onAddChild, onAddBefore, onAddAfter }: Props) => {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(initialValue || "");
    const [mode, setMode] = useState<"child" | "before" | "after">("child");
    const [nodeType, setNodeType] = useState<"tag" | "value">("tag");

    useEffect(() => {
        setValue(initialValue || "");
    }, [initialValue]);

    const handleSubmit = () => {
        const content = value.trim();
        if (!content) return;

        const isValue = nodeType === "value";

        if (mode === "child") onAddChild(content, isValue);
        else if (mode === "before") onAddBefore(content, isValue);
        else if (mode === "after") onAddAfter(content, isValue);

        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={(_ev, data) => setOpen(data.open)} trapFocus>
            <PopoverTrigger>
                <Tooltip content="Add element" relationship="label">
                    <ToolbarButton icon={<AddRegular />} disabled={disabled} onClick={() => setOpen(true)} aria-label="Add element" />
                </Tooltip>
            </PopoverTrigger>

            <PopoverSurface style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <Label>Add element</Label>

                <RadioGroup value={nodeType} onChange={(_, data) => setNodeType(data.value as "tag" | "value")} layout="horizontal">
                    <Radio value="tag" label="Tag" />
                    <Radio value="value" label="Value" />
                </RadioGroup>

                <Input
                    placeholder={nodeType === "tag" ? "Tag name (e.g. div)" : "Value content"}
                    value={value}
                    onChange={(e) => setValue((e.target as HTMLInputElement).value)}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") handleSubmit();
                    }}
                    autoFocus
                />
                <RadioGroup value={mode} onChange={(_, data) => setMode(data.value as "child" | "before" | "after")} layout="horizontal">
                    <Radio value="child" label="Child" />
                    <Radio value="before" label="Before" />
                    <Radio value="after" label="After" />
                </RadioGroup>
                <Button appearance="primary" onClick={handleSubmit}>Add</Button>
            </PopoverSurface>
        </Popover>
    );
};
