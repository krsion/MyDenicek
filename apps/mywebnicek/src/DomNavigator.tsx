/**
 * DomNavigator - Enables navigation and highlighting within a DOM tree
 *
 * Features:
 * - Click/keyboard navigation through elements
 * - Multi-select with Ctrl/Cmd+click
 * - Range/generalized selection with Shift+click
 * - Remote peer selection overlays
 */

import { makeStyles } from "@fluentui/react-components";
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { colorFromString } from "./DomNavigator/colorUtils";
import {
    firstElementChildOf,
    nextSibling,
    parentOf,
    prevSibling,
    withinContainer as checkWithinContainer,
} from "./DomNavigator/domHelpers";
import { useOverlayPosition, usePeerOverlays } from "./DomNavigator/useOverlayPosition";

export interface DomNavigatorHandle {
    navigateToParent: () => void;
    navigateToFirstChild: () => void;
    navigateToPrevSibling: () => void;
    navigateToNextSibling: () => void;
    clearSelection: () => void;
}

const useStyles = makeStyles({
    overlay: {
        position: "absolute",
        pointerEvents: "none",
        borderRadius: "6px",
        boxShadow: "0 0 0 2px rgba(59,130,246,0.9), 0 0 0 6px rgba(59,130,246,0.2)",
        background: "rgba(59,130,246,0.10)",
        transition: "all 120ms ease",
    },
    overlayLabel: {
        position: "absolute",
        top: "-24px",
        left: "0px",
        padding: "2px 6px",
        fontSize: "11px",
        background: "#1f2937",
        color: "#fff",
        borderRadius: "4px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        whiteSpace: "nowrap",
    },
});

interface DomNavigatorProps {
    children: React.ReactNode;
    onSelectedChange?: (nodeIds: string[]) => void;
    selectedNodeIds?: string[];
    remoteSelections?: { [userId: string]: string[] | null };
    generalizer?: (nodeIds: string[]) => string[];
}

export const DomNavigator = React.forwardRef<DomNavigatorHandle, DomNavigatorProps>(
    ({ children, onSelectedChange, selectedNodeIds, remoteSelections, generalizer }, forwardedRef) => {
        const wrapperRef = useRef<HTMLDivElement | null>(null);
        const containerRef = useRef<HTMLDivElement | null>(null);
        const [selectedElements, setSelectedElements] = useState<HTMLElement[]>([]);
        const styles = useStyles();

        // Bound version of withinContainer for this component
        const withinContainer = useCallback(
            (el: Element | null): el is HTMLElement => checkWithinContainer(el, containerRef),
            []
        );

        // Use extracted hooks for overlay management
        const { overlays, setOverlays, updateOverlays } = useOverlayPosition(wrapperRef, selectedElements);
        const { peerOverlays } = usePeerOverlays(wrapperRef, containerRef, remoteSelections, withinContainer);

        // Focus the container on mount
        useEffect(() => {
            containerRef.current?.focus();
        }, []);

        // Ensure wrapper is positioned for absolute overlays
        useEffect(() => {
            const el = wrapperRef.current;
            if (!el) return;
            const cs = window.getComputedStyle(el);
            const prevInline = el.style.position;
            if (cs.position === "static") {
                el.style.position = "relative";
            }
            return () => {
                el.style.position = prevInline || "";
            };
        }, []);

        // Sync selection from external prop
        useEffect(() => {
            if (typeof selectedNodeIds === "undefined") return;
            if (!selectedNodeIds || selectedNodeIds.length === 0) {
                setSelectedElements([]);
                setOverlays([]);
                return;
            }
            const root = containerRef.current;
            if (!root) return;

            const elements: HTMLElement[] = [];
            for (const id of selectedNodeIds) {
                const el = root.querySelector(`[data-node-guid="${id}"]`) as HTMLElement | null;
                if (el && withinContainer(el)) {
                    elements.push(el);
                }
            }

            if (elements.length > 0) {
                setSelectedElements(elements);
                updateOverlays(elements);
                containerRef.current?.focus();
            }
        }, [updateOverlays, selectedNodeIds, setOverlays, withinContainer]);

        // Keyboard navigation handler
        function handleKeyDown(e: React.KeyboardEvent) {
            if (!containerRef.current) return;

            const navigationKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape"];
            if (!navigationKeys.includes(e.key)) return;

            e.preventDefault();
            e.stopPropagation();

            if (e.key === "Escape") {
                setSelectedElements([]);
                setOverlays([]);
                onSelectedChange?.([]);
                return;
            }

            if (selectedElements.length === 0) {
                const start = firstElementChildOf(containerRef.current);
                if (start) {
                    setSelectedElements([start]);
                    onSelectedChange?.([start.getAttribute("data-node-guid") || ""]);
                }
                return;
            }

            const anchor = selectedElements[selectedElements.length - 1];
            if (!anchor) return;
            let next: HTMLElement | null = null;

            switch (e.key) {
                case "ArrowUp": next = parentOf(anchor); break;
                case "ArrowDown": next = firstElementChildOf(anchor); break;
                case "ArrowLeft": next = prevSibling(anchor); break;
                case "ArrowRight": next = nextSibling(anchor); break;
            }

            if (next && next !== anchor) {
                setSelectedElements([next]);
                onSelectedChange?.([next.getAttribute("data-node-guid") || ""]);
                next.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
        }

        // Click handler for selection
        function handleClick(e: React.MouseEvent) {
            if (!(e.target instanceof HTMLElement)) return;
            if (!withinContainer(e.target)) return;

            const originalTarget = e.target;
            const interactiveTags = ["INPUT", "TEXTAREA", "SELECT", "BUTTON"];
            if (interactiveTags.includes(originalTarget.tagName) && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                return;
            }

            const target = originalTarget.closest('[data-node-guid]') as HTMLElement | null;
            if (!target || !withinContainer(target)) return;

            const targetId = target.getAttribute("data-node-guid");
            if (!targetId) return;

            let newSelection: HTMLElement[] = [];

            if (e.ctrlKey || e.metaKey) {
                // Toggle selection
                if (selectedElements.some(el => el.getAttribute("data-node-guid") === targetId)) {
                    newSelection = selectedElements.filter(el => el.getAttribute("data-node-guid") !== targetId);
                } else {
                    newSelection = [...selectedElements, target];
                }
            } else if (e.shiftKey && selectedElements.length > 0) {
                const lastSelected = selectedElements[selectedElements.length - 1];
                if (!lastSelected) {
                    newSelection = [target];
                } else {
                    const lastId = lastSelected.getAttribute("data-node-guid");

                    if (generalizer && lastId && targetId) {
                        const generalizedIds = generalizer([lastId, targetId]);
                        const root = containerRef.current;
                        if (root) {
                            newSelection = generalizedIds
                                .map(id => root.querySelector(`[data-node-guid="${id}"]`) as HTMLElement | null)
                                .filter((el): el is HTMLElement => !!el && withinContainer(el));
                            setSelectedElements(newSelection);
                            const ids = newSelection.map(el => el.getAttribute("data-node-guid")).filter((id): id is string => !!id);
                            onSelectedChange?.(ids);
                            return;
                        } else {
                            newSelection = [target];
                        }
                    } else {
                        const allNavigable = Array.from(containerRef.current?.querySelectorAll('[data-node-guid]') || []) as HTMLElement[];
                        const lastIndex = allNavigable.indexOf(lastSelected);
                        const targetIndex = allNavigable.indexOf(target);

                        if (lastIndex !== -1 && targetIndex !== -1) {
                            const start = Math.min(lastIndex, targetIndex);
                            const end = Math.max(lastIndex, targetIndex);
                            newSelection = allNavigable.slice(start, end + 1);
                        } else {
                            newSelection = [target];
                        }
                    }
                }
            } else {
                newSelection = [target];
            }

            setSelectedElements(newSelection);
            onSelectedChange?.(newSelection.map(el => el.getAttribute("data-node-guid") || "").filter(Boolean));
        }

        // Programmatic navigation helper
        const navigate = useCallback((getNext: (current: HTMLElement) => HTMLElement | null) => {
            if (selectedElements.length === 0) {
                const start = firstElementChildOf(containerRef.current);
                if (start) {
                    setSelectedElements([start]);
                    onSelectedChange?.([start.getAttribute("data-node-guid") || ""]);
                }
                return;
            }

            const anchor = selectedElements[selectedElements.length - 1];
            if (!anchor) return;
            const next = getNext(anchor);
            if (next && next !== anchor) {
                setSelectedElements([next]);
                onSelectedChange?.([next.getAttribute("data-node-guid") || ""]);
                next.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
        }, [selectedElements, onSelectedChange]);

        // Expose navigation methods via ref
        useImperativeHandle(forwardedRef, () => ({
            navigateToParent: () => navigate(parentOf),
            navigateToFirstChild: () => navigate(firstElementChildOf),
            navigateToPrevSibling: () => navigate(prevSibling),
            navigateToNextSibling: () => navigate(nextSibling),
            clearSelection: () => {
                setSelectedElements([]);
                setOverlays([]);
                onSelectedChange?.([]);
            }
        }), [navigate, onSelectedChange, setOverlays]);

        function handleMouseDown(e: React.MouseEvent) {
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                e.preventDefault();
            }
        }

        return (
            <div ref={wrapperRef}>
                <div
                    ref={containerRef}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                    onClick={handleClick}
                    onMouseDown={handleMouseDown}
                >
                    {children}
                </div>

                {/* Selection overlays */}
                {overlays.map(overlay => (
                    <div
                        key={overlay.id}
                        aria-hidden
                        className={styles.overlay}
                        style={{
                            top: overlay.top,
                            left: overlay.left,
                            width: overlay.width,
                            height: overlay.height,
                        }}
                    >
                        <div
                            data-testid="overlay-label"
                            data-tagname={overlay.label.split("#")[0]?.split(".")[0]}
                            className={styles.overlayLabel}
                        >
                            {overlay.label}
                        </div>
                    </div>
                ))}

                {/* Peer selection overlays */}
                {Object.entries(peerOverlays).flatMap(([peerId, overlays]) => {
                    const colors = colorFromString(peerId);
                    return overlays.map(o => {
                        if (!o.visible) return null;
                        return (
                            <div
                                key={`peer-${peerId}-${o.id}`}
                                aria-hidden
                                className={styles.overlay}
                                style={{
                                    top: o.top,
                                    left: o.left,
                                    width: o.width,
                                    height: o.height,
                                    background: colors.fill,
                                    boxShadow: `0 0 0 2px ${colors.subtle}`,
                                    pointerEvents: "none",
                                    transition: "all 120ms ease",
                                }}
                            >
                                <div
                                    data-testid={`peer-overlay-label-${peerId}`}
                                    className={styles.overlayLabel}
                                    style={{ background: colors.stroke, color: "#fff", fontSize: 11 }}
                                >
                                    {peerId}
                                </div>
                            </div>
                        );
                    });
                })}
            </div>
        );
    }
);

DomNavigator.displayName = 'DomNavigator';
