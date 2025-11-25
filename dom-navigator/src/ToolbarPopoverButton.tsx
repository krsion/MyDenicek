import { Input, ToolbarButton, Tooltip } from "@fluentui/react-components";
import { Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-popover";
import { type KeyboardEvent, useEffect, useState } from "react";

type Props = {
    icon?: React.ReactElement;
    disabled?: boolean;
    placeholder?: string;
    ariaLabel?: string;
    children?: React.ReactNode;
    onSubmit: (tag: string) => void;
    initialValue?: string;
    text: string;
};

export const ToolbarPopoverButton = ({ icon, disabled, placeholder, ariaLabel, children, onSubmit, initialValue, text }: Props) => {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    return (
        <Popover open={open} onOpenChange={(_ev, data) => setOpen(data.open)}>
            <PopoverTrigger>
                <Tooltip content={text} relationship="label" withArrow={true}>
                    <ToolbarButton icon={icon} disabled={disabled} onClick={() => setOpen(true)} aria-label={ariaLabel}>
                        {children}
                    </ToolbarButton>
                </Tooltip>
            </PopoverTrigger>

            <PopoverSurface style={{ padding: 12 }}>
                <Input
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => setValue((e.target as HTMLInputElement).value)}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                        if (e.key !== "Enter") return;
                        const tag = e.currentTarget.value.trim();
                        if (!tag) return;
                        onSubmit(tag);
                        setOpen(false);
                    }}
                />
            </PopoverSurface>
        </Popover>
    );
};

export default ToolbarPopoverButton;
