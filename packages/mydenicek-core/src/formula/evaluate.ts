/**
 * Formula evaluation engine
 * Evaluates formula nodes recursively with safeguards
 */

import type { FormulaContext } from '../types';

const MAX_DEPTH = 100;

/**
 * Evaluates a formula node and returns its computed value
 *
 * @param nodeId - The ID of the formula node to evaluate
 * @param context - The formula context containing operations and document accessor
 * @param visited - Set of visited node IDs for cycle detection (internal)
 * @param depth - Current recursion depth for stack overflow protection (internal)
 * @returns The computed value, or an error string starting with #ERR:
 */
export function evaluateFormula(
    nodeId: string,
    context: FormulaContext,
    visited: Set<string> = new Set(),
    depth: number = 0
): unknown {
    const { document, operations } = context;

    // 1. Max depth protection
    if (depth > MAX_DEPTH) {
        return `#ERR: max depth exceeded`;
    }

    // 2. Circular reference detection
    if (visited.has(nodeId)) {
        return `#ERR: circular reference`;
    }
    visited.add(nodeId);

    // 3. Deleted node handling
    const node = document.getNode(nodeId);
    if (!node) return `#ERR: node deleted`;
    if (node.kind !== 'formula') return null;

    // 4. Evaluate all children as arguments
    const args = document.getChildIds(nodeId).map(childId => {
        const child = document.getNode(childId);
        if (!child) return `#ERR: child deleted`;
        if (child.kind === 'ref') return getNodeValue(child.target, context, visited, depth + 1);
        if (child.kind === 'value') return child.value;
        if (child.kind === 'formula') return evaluateFormula(childId, context, visited, depth + 1);
        return null;
    });

    // 5. Operation lookup
    const op = operations.get(node.operation);
    if (!op) return `#ERR: ${node.operation} not found`;

    // 6. Arity validation
    if (op.arity !== -1 && args.length !== op.arity) {
        return `#ERR: ${node.operation} expects ${op.arity} args, got ${args.length}`;
    }

    // 7. Execute operation
    return op.execute(args, context);
}

/**
 * Gets the value of a node for formula evaluation
 * Handles value nodes, formula nodes, and ref nodes
 *
 * @param nodeId - The ID of the node to get value from
 * @param context - The formula context
 * @param visited - Set of visited node IDs for cycle detection (internal)
 * @param depth - Current recursion depth (internal)
 * @returns The node's value, or an error string
 */
export function getNodeValue(
    nodeId: string,
    context: FormulaContext,
    visited: Set<string> = new Set(),
    depth: number = 0
): unknown {
    // Deleted node handling
    const node = context.document.getNode(nodeId);
    if (!node) return `#ERR: ref target deleted`;

    if (node.kind === 'value') return node.value;
    if (node.kind === 'formula') return evaluateFormula(nodeId, context, visited, depth);
    if (node.kind === 'ref') return getNodeValue(node.target, context, visited, depth);
    return null;
}

/**
 * Checks if a value is an error result
 */
export function isFormulaError(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('#ERR:');
}
