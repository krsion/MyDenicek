import { Button, Combobox, Input, Label, Option, Radio, RadioGroup, Text, ToolbarButton, Tooltip } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-popover";
import { type KeyboardEvent, useEffect, useState } from "react";

import { builtinOperationNames } from "./formula";
import { sanitizeTagName, validateTagName } from "./ToolbarPopoverButton";

export type NodeKind = "element" | "value" | "action" | "formula" | "ref";

type Props = {
    disabled: boolean;
    canAddChild?: boolean;
    initialValue?: string;
    onAddChild: (content: string, kind: NodeKind) => void;
    onStartRefPick?: () => void;
};

export const AddNodePopoverButton = ({ disabled, canAddChild = true, initialValue, onAddChild, onStartRefPick }: Props) => {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(initialValue || "");
    const [nodeType, setNodeType] = useState<"tag" | "value" | "action" | "formula" | "ref">("tag");
    const [operation, setOperation] = useState<string>("sum");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setValue(initialValue || "");
        setError(null);
    }, [initialValue]);

    const handleSubmit = () => {
        const content = value.trim();

        // Require content for tag and action nodes, but allow empty value nodes
        if (!content && nodeType !== "value" && nodeType !== "formula") return;

        // Validate tag names (not for value, action, formula, or ref nodes)
        if (nodeType === "tag") {
            const validationError = validateTagName(content);
            if (validationError) {
                setError(validationError);
                return;
            }
        }

        // Sanitize tag name (strip angle brackets, lowercase) - only for tag type
        let finalContent = nodeType === "tag" ? (sanitizeTagName(content).tag || content) : content;

        // For formula nodes, use the operation as content
        if (nodeType === "formula") {
            finalContent = operation;
        }

        // Map nodeType to NodeKind
        const kind: NodeKind = nodeType === "tag" ? "element" : nodeType;

        setError(null);
        onAddChild(finalContent, kind);

        setOpen(false);
    };

    const getPlaceholder = () => {
        switch (nodeType) {
            case "tag": return "Tag name (e.g. div)";
            case "value": return "Value content (optional)";
            case "action": return "Button label";
            case "ref": return "Target node ID";
            default: return "";
        }
    };

    return (
        <Popover open={open} onOpenChange={(_ev, data) => {
            setOpen(data.open);
            if (!data.open) setError(null);
        }} trapFocus>
            <PopoverTrigger>
                <Tooltip content="Add child" relationship="label">
                    <ToolbarButton icon={<AddRegular />} disabled={disabled || !canAddChild} onClick={() => setOpen(true)} aria-label="Add child" />
                </Tooltip>
            </PopoverTrigger>

            <PopoverSurface style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <Label>Add child node</Label>

                <RadioGroup value={nodeType} onChange={(_, data) => {
                    setNodeType(data.value as "tag" | "value" | "action" | "formula" | "ref");
                    setError(null);
                }} layout="horizontal" style={{ flexWrap: "wrap" }}>
                    <Radio value="tag" label="Tag" />
                    <Radio value="value" label="Value" />
                    <Radio value="action" label="Action" />
                    <Radio value="formula" label="Formula" />
                    <Radio value="ref" label="Ref" />
                </RadioGroup>

                {nodeType === "formula" ? (
                    <Combobox
                        placeholder="Select operation"
                        value={operation}
                        onOptionSelect={(_, data) => {
                            if (data.optionValue) setOperation(data.optionValue);
                        }}
                        autoFocus
                    >
                        {builtinOperationNames.map((name) => (
                            <Option key={name} value={name}>{name}</Option>
                        ))}
                    </Combobox>
                ) : nodeType === "ref" ? (
                    <Button
                        appearance="primary"
                        onClick={() => {
                            if (onStartRefPick) {
                                onStartRefPick();
                                setOpen(false);
                            }
                        }}
                    >
                        Pick target from document...
                    </Button>
                ) : (
                    <Input
                        placeholder={getPlaceholder()}
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
                )}
                {error && (
                    <Text size={200} style={{ color: "#d13438" }}>
                        {error}
                    </Text>
                )}
                <Button appearance="primary" onClick={handleSubmit}>Add</Button>
            </PopoverSurface>
        </Popover>
    );
};
