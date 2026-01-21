import { Input, Text, ToolbarButton, Tooltip } from "@fluentui/react-components";
import { Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-popover";
import { type KeyboardEvent, useEffect, useState } from "react";

type Props = {
    icon: React.ReactElement;
    disabled: boolean;
    placeholder?: string;
    ariaLabel?: string;
    children?: React.ReactNode;
    onSubmit: (tag: string) => void;
    initialValue?: string;
    text: string;
    /** Optional validation function. Returns error message or null if valid. */
    validate?: (value: string) => string | null;
};

/**
 * Sanitize and validate a tag name for use with HTML elements.
 * Strips angle brackets, converts to lowercase, validates format.
 */
export function sanitizeTagName(input: string): { tag: string; error: string | null } {
    // Strip angle brackets and whitespace
    const tag = input.replace(/[<>]/g, "").trim().toLowerCase();

    if (!tag) {
        return { tag: "", error: "Tag name cannot be empty" };
    }

    // HTML tag names must start with a letter and contain only letters, digits, or hyphens
    // (Custom elements require a hyphen, but standard elements don't)
    const validTagPattern = /^[a-z][a-z0-9-]*$/;
    if (!validTagPattern.test(tag)) {
        return { tag, error: "Tag must start with a letter and contain only letters, numbers, or hyphens" };
    }

    return { tag, error: null };
}

/** Default validator for HTML tag names */
export function validateTagName(value: string): string | null {
    const { error } = sanitizeTagName(value);
    return error;
}

export const ToolbarPopoverButton = ({ icon, disabled, placeholder, ariaLabel, children, onSubmit, initialValue, text, validate }: Props) => {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(initialValue);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setValue(initialValue);
        setError(null);
    }, [initialValue]);

    const handleSubmit = (inputValue: string) => {
        const trimmed = inputValue.trim();
        if (validate) {
            const validationError = validate(trimmed);
            if (validationError) {
                setError(validationError);
                return;
            }
        }
        setError(null);
        onSubmit(trimmed);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={(_ev, data) => {
            setOpen(data.open);
            if (!data.open) setError(null);
        }}>
            <PopoverTrigger>
                <Tooltip content={text} relationship="label" withArrow={true}>
                    <ToolbarButton icon={icon} disabled={disabled} onClick={() => setOpen(true)} aria-label={ariaLabel}>
                        {children}
                    </ToolbarButton>
                </Tooltip>
            </PopoverTrigger>

            <PopoverSurface style={{ padding: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <Input
                        placeholder={placeholder}
                        value={value || ""}
                        onChange={(e) => {
                            setValue((e.target as HTMLInputElement).value);
                            setError(null);
                        }}
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                            if (e.key !== "Enter") return;
                            handleSubmit(e.currentTarget.value);
                        }}
                    />
                    {error && (
                        <Text size={200} style={{ color: "#d13438" }}>
                            {error}
                        </Text>
                    )}
                </div>
            </PopoverSurface>
        </Popover>
    );
};
