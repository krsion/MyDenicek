/**
 * DOM traversal and query helpers for DomNavigator
 */

/**
 * Check if an element is within the container
 */
export function withinContainer(el: Element | null, containerRef: React.RefObject<HTMLElement | null>): el is HTMLElement {
    if (!el || !(el instanceof HTMLElement)) return false;
    const root = containerRef.current;
    return !!root && root.contains(el);
}

/**
 * Get the first HTMLElement child of an element
 */
export function firstElementChildOf(el: HTMLElement | null): HTMLElement | null {
    if (!el) return null;
    let c: Element | null = el.firstElementChild;
    while (c && !(c instanceof HTMLElement)) c = c.nextElementSibling;
    return c instanceof HTMLElement ? c : null;
}

/**
 * Get the previous sibling element
 */
export function prevSibling(el: HTMLElement | null): HTMLElement | null {
    if (!el) return null;
    return el.previousElementSibling as HTMLElement | null;
}

/**
 * Get the next sibling element
 */
export function nextSibling(el: HTMLElement | null): HTMLElement | null {
    if (!el) return null;
    return el.nextElementSibling as HTMLElement | null;
}

/**
 * Get the parent element
 */
export function parentOf(el: HTMLElement | null): HTMLElement | null {
    if (!el) return null;
    return el.parentElement as HTMLElement | null;
}

/**
 * Describe an element (returns lowercase tag name)
 */
export function describe(el: HTMLElement): string {
    return el.tagName.toLowerCase();
}

/**
 * Find elements by node IDs within a container
 */
export function findElementsByIds(
    root: HTMLElement | null,
    nodeIds: string[],
    containerRef: React.RefObject<HTMLElement | null>
): HTMLElement[] {
    if (!root) return [];
    const elements: HTMLElement[] = [];
    for (const id of nodeIds) {
        const el = root.querySelector(`[data-node-guid="${id}"]`) as HTMLElement | null;
        if (el && withinContainer(el, containerRef)) {
            elements.push(el);
        }
    }
    return elements;
}
