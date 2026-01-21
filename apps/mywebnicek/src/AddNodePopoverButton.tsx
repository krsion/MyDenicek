import { Button, Input, Label, Radio, RadioGroup, Text, ToolbarButton, Tooltip } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-popover";
import { type KeyboardEvent, useEffect, useState } from "react";

import { sanitizeTagName, validateTagName } from "./ToolbarPopoverButton";

export type NodeKind = "element" | "value" | "action";

type Props = {
    disabled: boolean;
    initialValue?: string;
    onAddChild: (content: string, kind: NodeKind) => void;
    onAddBefore: (content: string, kind: NodeKind) => void;
    onAddAfter: (content: string, kind: NodeKind) => void;
};

export const AddNodePopoverButton = ({ disabled, initialValue, onAddChild, onAddBefore, onAddAfter }: Props) => {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(initialValue || "");
    const [mode, setMode] = useState<"child" | "before" | "after">("child");
    const [nodeType, setNodeType] = useState<"tag" | "value" | "action">("tag");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setValue(initialValue || "");
        setError(null);
    }, [initialValue]);

    const handleSubmit = () => {
        const content = value.trim();

        // Require content for tag and action nodes, but allow empty value nodes
        if (!content && nodeType !== "value") return;

        // Validate tag names (not for value or action nodes)
        if (nodeType === "tag") {
            const validationError = validateTagName(content);
            if (validationError) {
                setError(validationError);
                return;
            }
        }

        // Sanitize tag name (strip angle brackets, lowercase) - only for tag type
        const finalContent = nodeType === "tag" ? (sanitizeTagName(content).tag || content) : content;

        // Map nodeType to NodeKind
        const kind: NodeKind = nodeType === "tag" ? "element" : nodeType;

        setError(null);
        if (mode === "child") onAddChild(finalContent, kind);
        else if (mode === "before") onAddBefore(finalContent, kind);
        else if (mode === "after") onAddAfter(finalContent, kind);

        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={(_ev, data) => {
            setOpen(data.open);
            if (!data.open) setError(null);
        }} trapFocus>
            <PopoverTrigger>
                <Tooltip content="Add element" relationship="label">
                    <ToolbarButton icon={<AddRegular />} disabled={disabled} onClick={() => setOpen(true)} aria-label="Add element" />
                </Tooltip>
            </PopoverTrigger>

            <PopoverSurface style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <Label>Add element</Label>

                <RadioGroup value={nodeType} onChange={(_, data) => {
                    setNodeType(data.value as "tag" | "value" | "action");
                    setError(null);
                }} layout="horizontal">
                    <Radio value="tag" label="Tag" />
                    <Radio value="value" label="Value" />
                    <Radio value="action" label="Action" />
                </RadioGroup>

                <Input
                    placeholder={nodeType === "tag" ? "Tag name (e.g. div)" : nodeType === "action" ? "Button label" : "Value content (optional)"}
                    value={value}
                    onChange={(e) => {
                        setValue((e.target as HTMLInputElement).value);
                        setError(null);
                    }}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") handleSubmit();
                    }}
                    autoFocus
                />
                {error && (
                    <Text size={200} style={{ color: "#d13438" }}>
                        {error}
                    </Text>
                )}
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
