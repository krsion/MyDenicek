import { Button, Input, Label, Radio, RadioGroup, ToolbarButton, Tooltip } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-popover";
import { type KeyboardEvent, useEffect, useState } from "react";

type Props = {
    disabled?: boolean;
    initialValue?: string;
    onAddChild: (tag: string) => void;
    onAddBefore: (tag: string) => void;
    onAddAfter: (tag: string) => void;
};

export const AddNodePopoverButton = ({ disabled, initialValue, onAddChild, onAddBefore, onAddAfter }: Props) => {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(initialValue || "");
    const [mode, setMode] = useState<"child" | "before" | "after">("child");

    useEffect(() => {
        setValue(initialValue || "");
    }, [initialValue]);

    const handleSubmit = () => {
        const tag = value.trim();
        if (!tag) return;

        if (mode === "child") onAddChild(tag);
        else if (mode === "before") onAddBefore(tag);
        else if (mode === "after") onAddAfter(tag);

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
                <Input
                    placeholder="Tag name (e.g. div)"
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
