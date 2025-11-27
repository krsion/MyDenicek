# MyDenicek: Local-first Software Implementation
- **Research Project Proposal:** [View PDF](https://github.com/krsion/MyDenicek/blob/main/proposal/proposal.pdf)
- **Live Demo (WIP):** [Launch App](https://krsion.github.io/MyDenicek/)

## Internal State Representation
The application is built on **Automerge**, which synchronizes JSON state using Conflict-free Replicated Data Types (CRDTs).

```typescript
export type ElementNode = {
  kind: "element";
  tag: string;
  attrs: Record<string, unknown>;
  children: string[];
}

export type ValueNode = {
  kind: "value";
  value: string;
};

export type Node = ElementNode | ValueNode;

export type JsonDoc = {
  root: string;
  nodes: Record<string, Node>;
};
```

## Design Decisions & Considerations

### 1. Why are nodes indexed by ID instead of Path?
If we identified nodes by path (e.g., `doc.body.children[2]`), we would face the **"Shifting Index"** problem. For example, if Alice wraps a `<b>` tag in an `<article>` while Bob concurrently renames that same `<b>` to `<strong>`, a path-based approach often results in malformed nesting (e.g., `<strong><b>...</b></strong>`). The original [Denicek](https://dl.acm.org/doi/10.1145/3746059.3747646) relies on path-based Operational Transformation (OT), which we try to avoid by using CRDTs.

By using unique IDs, we address the object itself regardless of where it moves in the tree. This aligns with the approach taken in [Martin Kleppmann's JSON CRDT](https://ieeexplore.ieee.org/abstract/document/7909007).

### 2. How should concurrent "Wrap" operations behave?
Consider a scenario where Alice wraps a list item `<li>` in a `<ul>` (unordered list), while Bob concurrently wraps the same `<li>` in an `<ol>` (ordered list).

**Possible Outcomes:**
1.  **Winner-Takes-All (Preferred):** The result is either `<ul><li>...</li></ul>` OR `<ol><li>...</li></ol>`. The conflict is resolved by the system, but the user can switch the tag later via the UI.
2.  **Double Wrapping:** `<ul><ol><li>...</li></ol></ul>`. This creates a nested list that neither user intended.
3.  **Duplication:** `<ul><li>...</li></ul>` AND `<ol><li>...</li></ol>` (Two separate lists). This requires manual conflict resolution to delete the duplicate.

**Our Solution:**
To achieve outcome #1, we generate deterministic ID for the wrapper node, such as `wrapper-${wrapped-element-id}`.
* Because both clients generate the *same ID* for the new parent, Automerge treats this as a concurrent edit to the *same object*.
* Automerge's built-in **Last-Writer-Wins (LWW)** logic resolves the conflict on the `tag` property (choosing either `ul` or `ol`), preventing the creation of two separate wrapper nodes.

### 3. Why are nodes stored in a Dictionary (Map) and not a List?
Storing nodes in a list of objects—e.g., `[{id: "A", ...}, {id: "B", ...}]`—allows for duplicate entries of the same ID during concurrent inserts, making updates computationally expensive (requiring O(N) searches).

A Dictionary (`Record<string, Node>`) enforces uniqueness by ID and allows O(1) access. However, because JSON dictionaries are unordered, we store the order of nodes separately in the `children[]` array of the parent element. Keep in mind, that there could be duplicate ids in the `children[]` array caused by concurrent adds of the same node. 

### 4. Why use a Flat Map instead of a Tree Structure?
While there is ongoing research into [Move Operations in JSON CRDTs](https://dl.acm.org/doi/10.1145/3642976.3653030) and an active [Automerge PR](https://github.com/automerge/automerge/pull/706), robust tree-move operations are not yet production-ready.

A flat map acts as a workaround. It allows us to "move" or "wrap" nodes simply by updating the `children` array of the parent node. The actual node content remains untouched in the `nodes` map, avoiding the need to rewrite deep sections of the document tree.

### 5. Why is node ordering local (per parent) rather than global?
We only need to know the relative order of *siblings* when rendering or editing. A global ordering system would require maintaining a complex mapping of `Global Index <-> Local Index`. By storing order only within the `children` array of `ElementNode`, we simplify the implementation significantly without losing functionality.

## Behavior During Concurrent Edits

The following table outlines how the system resolves specific concurrent operations:

| Concurrent Operations | Resolution Behavior | Logic |
| :--- | :--- | :--- |
| **Wrap (A) vs Wrap (B)** | **Single Wrapper** | Uses deterministic ID generation for the wrapper. The tag (A or B) is decided by LWW. |
| **Add Child vs Add Child** | **Both Added** | `addChild` generates a random unique ID. Both nodes appear in the parent's children list. |
| **Rename Tag vs Rename Tag** | **One Tag Wins** | Last-Writer-Wins (LWW) on the `tag` property. |
| **Edit Value vs Edit Value** | **One Value Wins** | LWW on the `value` property. |
| **Wrap vs Add Child** | **Success** | The child is added to the intended parent (inner node), not the wrapper. |
| **Wrap vs Rename Tag** | **Success** | The correct node is wrapped, and the correct node is renamed. |
| **Wrap vs Edit Value** | **Success** | The correct node is wrapped, and its content is updated. |
| **Add Child vs Rename Tag** | **Success** | The child is added to the element, which now has a new tag name. |
| **Add Child vs Edit** | **Unreachable** | `Add child` operation is allowed only for `ElementNodes`, while `Edit` operation is allowed only for `ValueNodes` |
| **Rename Tag vs Edit** | **Unreachable** |  `Rename Tag` operation is allowed only for `ElementNodes`, while `Edit` operation is allowed only for `ValueNodes` |