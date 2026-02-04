/**
 * Formula evaluation engine
 * Evaluates formula nodes recursively with safeguards.
 *
 * Supports two evaluation modes:
 * - Child-based: formula has children that serve as operands (original model)
 * - RPN sibling stack: childless formula reads operands from preceding siblings
 */

import type { FormulaContext } from '../types';

const MAX_DEPTH = 100;

/**
 * Evaluates a formula node and returns its computed value.
 * Childless formulas use RPN sibling stack evaluation.
 * Formulas with children use child-based evaluation.
 */
export function evaluateFormula(
    nodeId: string,
    context: FormulaContext,
    visited: Set<string> = new Set(),
    depth: number = 0
): unknown {
    const { document, operations } = context;

    if (depth > MAX_DEPTH) {
        return `#ERR: max depth exceeded`;
    }

    if (visited.has(nodeId)) {
        return `#ERR: circular reference`;
    }
    visited.add(nodeId);

    const node = document.getNode(nodeId);
    if (!node) return `#ERR: node deleted`;
    if (node.kind !== 'formula') return null;

    const childIds = document.getChildIds(nodeId);

    // Childless formula: evaluate using RPN sibling stack
    if (childIds.length === 0) {
        return evaluateSiblingStack(nodeId, context, visited, depth);
    }

    // Child-based evaluation (original model)
    const args = childIds.map(childId => {
        const child = document.getNode(childId);
        if (!child) return `#ERR: child deleted`;
        if (child.kind === 'ref') return getNodeValue(child.target, context, visited, depth + 1);
        if (child.kind === 'value') return child.value;
        if (child.kind === 'formula') return evaluateFormula(childId, context, visited, depth + 1);
        return null;
    });

    const op = operations.get(node.operation);
    if (!op) return `#ERR: ${node.operation} not found`;

    if (op.arity !== -1 && args.length !== op.arity) {
        return `#ERR: ${node.operation} expects ${op.arity} args, got ${args.length}`;
    }

    return op.execute(args, context);
}

/**
 * Evaluates a childless formula by processing preceding siblings as an RPN stack.
 * Values push onto the stack; childless formulas pop N args and push the result.
 * Element and action nodes are skipped (they don't participate in the stack).
 */
function evaluateSiblingStack(
    nodeId: string,
    context: FormulaContext,
    visited: Set<string>,
    depth: number
): unknown {
    const { document, operations } = context;
    const parentId = document.getParentId(nodeId);
    if (!parentId) return `#ERR: no parent for stack eval`;

    const siblings = document.getChildIds(parentId);
    const myIndex = siblings.indexOf(nodeId);
    if (myIndex === -1) return `#ERR: node not in parent`;

    const stack: unknown[] = [];
    for (let i = 0; i <= myIndex; i++) {
        const siblingId = siblings[i]!;
        const sibling = document.getNode(siblingId);
        if (!sibling) continue;

        if (sibling.kind === 'value') {
            stack.push(sibling.value);
        } else if (sibling.kind === 'ref') {
            stack.push(getNodeValue(sibling.target, context, new Set(visited), depth + 1));
        } else if (sibling.kind === 'formula') {
            const childIds = document.getChildIds(siblingId);
            if (childIds.length > 0) {
                // Formula with children: evaluate normally and push result
                stack.push(evaluateFormula(siblingId, context, new Set(visited), depth + 1));
            } else {
                // Childless formula: pop from stack, execute, push result
                const op = operations.get(sibling.operation);
                if (!op) { stack.push(`#ERR: ${sibling.operation} not found`); continue; }
                const popCount = op.arity === -1 ? stack.length : op.arity;
                if (stack.length < popCount) {
                    stack.push(`#ERR: ${sibling.operation} needs ${popCount} args, stack has ${stack.length}`);
                    continue;
                }
                const args = stack.splice(-popCount);
                stack.push(op.execute(args, context));
            }
        }
        // Element and action nodes are skipped
    }

    return stack.length > 0 ? stack[stack.length - 1] : `#ERR: empty stack`;
}

/**
 * Gets the value of a node for formula evaluation.
 * Handles value nodes, formula nodes, and ref nodes.
 */
export function getNodeValue(
    nodeId: string,
    context: FormulaContext,
    visited: Set<string> = new Set(),
    depth: number = 0
): unknown {
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
