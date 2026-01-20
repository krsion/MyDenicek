import { useCallback, useRef, useState } from "react";

interface ResizablePanelProps {
    children: React.ReactNode;
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    open: boolean;
}

export function ResizablePanel({
    children,
    defaultWidth = 350,
    minWidth = 200,
    maxWidth = 600,
    open
}: ResizablePanelProps) {
    const [width, setWidth] = useState(defaultWidth);
    const isDragging = useRef(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const startX = e.clientX;
        const startWidth = width;

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;
            const delta = startX - e.clientX;
            const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
            setWidth(newWidth);
        };

        const handleMouseUp = () => {
            isDragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [width, minWidth, maxWidth]);

    if (!open) return null;

    return (
        <div
            ref={panelRef}
            style={{
                width,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                borderLeft: '1px solid #e0e0e0',
                backgroundColor: '#fafafa',
                position: 'relative',
                height: '100%',
                overflow: 'hidden',
            }}
        >
            {/* Resize handle */}
            <div
                onMouseDown={handleMouseDown}
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '6px',
                    cursor: 'col-resize',
                    backgroundColor: 'transparent',
                    zIndex: 10,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 120, 212, 0.3)';
                }}
                onMouseLeave={(e) => {
                    if (!isDragging.current) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                    }
                }}
            />
            {/* Content */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {children}
            </div>
        </div>
    );
}
