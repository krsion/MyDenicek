# Design Document: Why Transactions Are Impossible in Local-First Software

## Abstract

This document explains why the compound `wrap` operation in Denicek — which combines `add` and `move` into a single "transaction" — cannot work correctly in local-first collaborative software. We show that this is not a bug to be fixed but a fundamental impossibility: **transactions require partition intolerance, but local-first software requires partition tolerance**. By the CAP theorem, these requirements are mutually exclusive. We propose replacing compound operations with explicit primitives, aligning with the architectural constraints of local-first systems.

---

## 1. The Problem

### 1.1 What We Tried to Build

The `wrapNode(target, tag)` operation was designed as an atomic transaction:

```
wrap(X) = atomic {
    W ← add(parent(X), tag)    // Create wrapper
    move(X, W)                  // Move target into wrapper
}
```

**Desired semantics:** Either both operations succeed together, or neither takes effect.

### 1.2 What Actually Happens

When two peers concurrently wrap the same node:

1. Both peers create wrappers (both succeed — creates never conflict)
2. Both peers move the target (one wins via LWW, one loses)
3. Result: One wrapper contains the target, one is empty

The "transaction" partially succeeded: the create worked, but the move failed. We have orphaned state.

### 1.3 Why Cleanup Doesn't Work

We attempted to clean up losing wrappers automatically, but:
- Empty wrappers from failed wraps are **indistinguishable** from intentionally created empty nodes
- Any cleanup algorithm either deletes legitimate nodes or keeps orphans
- This is proven formally in Appendix A

---

## 2. The Fundamental Constraint: CAP Theorem

### 2.1 CAP States a Trade-off

The CAP theorem (Brewer, 2000; Gilbert & Lynch, 2002) proves that a distributed system cannot simultaneously guarantee:

- **C**onsistency: All nodes see the same data at the same time
- **A**vailability: Every request receives a response
- **P**artition tolerance: System continues operating despite network partitions

**You must choose two.** In practice, since network partitions are unavoidable, you choose between:
- **CP:** Consistent but unavailable during partitions
- **AP:** Available but eventually consistent

### 2.2 Local-First Software Requires AP

Local-first software (Kleppmann et al., 2019) is defined by these properties:

1. **Works offline** — the device is partitioned from all other nodes
2. **No spinners** — operations complete immediately, locally
3. **Collaboration** — changes sync when connectivity returns

This is the definition of an **AP system**:
- **A:** Available offline (can always read/write locally)
- **P:** Partition tolerant (offline = partitioned from the network)
- **¬C:** Not strongly consistent (changes sync eventually)

**Local-first software cannot be CP.** If it were, offline operation would be impossible — every write would need to coordinate with the network.

### 2.3 Transactions Require CP

A transaction provides **atomicity**: multiple operations either all succeed or all fail, with no observable intermediate state.

To guarantee atomicity across distributed nodes, you need:
- All nodes to agree on whether the transaction committed
- This agreement requires **consensus** (Paxos, Raft, 2PC)
- Consensus requires a **quorum** of nodes to be reachable
- During a partition, a quorum may not be reachable
- Therefore: **transactions sacrifice availability during partitions**

Transactions are inherently **CP**.

### 2.4 The Impossibility

| Requirement | CAP Choice |
|-------------|------------|
| Local-first (offline support) | AP |
| Transactions (atomicity) | CP |

**These are mutually exclusive.** You cannot have both local-first and transactions.

This is not a limitation of our implementation, Loro, or CRDTs in general. It's a fundamental theorem of distributed systems.

---

## 3. CALM: Why This Is Provably Impossible

### 3.1 The CALM Theorem

The CALM theorem (Ameloot et al., 2013) provides a precise characterization:

> **A problem has a consistent, coordination-free distributed implementation if and only if it is monotonic.**

**Monotonic** means: adding more information never retracts previous conclusions.

### 3.2 Transactions Are Non-Monotonic

Consider detecting whether our `wrap` transaction succeeded:

```
wrapSucceeded(W, X) = (X ∈ children(W))
wrapFailed(W, X) = (X ∉ children(W))  // This is negation!
```

The success/failure check requires **negation** — asserting that something is or is *not* present. Negation is non-monotonic:

1. At time $t_1$: Peer A wraps X locally. X moves into $W_A$. $X \in children(W_A)$. Wrap "succeeded."
2. At time $t_2$: Receive peer B's concurrent move of X to $W_B$. LWW resolves, B wins. $X \notin children(W_A)$. Wrap "failed."

The conclusion changed from "succeeded" to "failed" as we received more information. This is the definition of non-monotonic.

### 3.3 CALM Says: Coordination Required

By CALM:
- Transaction success/failure detection is non-monotonic
- Therefore it **cannot** be implemented consistently without coordination
- Coordination requires communication
- Communication is impossible during partitions
- Therefore: transaction detection is impossible in partition-tolerant systems

### 3.4 What This Means for Cleanup

Our cleanup algorithm needs to determine: "Did this wrapper's transaction fail?"

- This is a non-monotonic query (requires negation)
- By CALM, it cannot be answered consistently without coordination
- We are partition-tolerant (local-first), so we cannot coordinate
- Therefore: **cleanup cannot be implemented correctly**

Any implementation will exhibit one of:
- **False positives:** Delete nodes that shouldn't be deleted
- **False negatives:** Keep nodes that should be deleted
- **Divergence:** Different replicas disagree on what was deleted

---

## 4. The Solution: No Transactions

### 4.1 Align with the Architecture

Since transactions are impossible in local-first software, we should not pretend to offer them.

**Instead of:**
```typescript
// Pseudo-transaction that can partially fail
model.wrapNode(targetId, "div");
```

**Provide:**
```typescript
// Two explicit operations, each with clear semantics
const wrapperId = model.addChild(parentId, { kind: "element", tag: "div" });
model.move(targetId, wrapperId, 0);
```

### 4.2 Why This Works

Each primitive operation has **single-effect semantics**:

| Operation | Effect | Can Conflict? | Conflict Resolution |
|-----------|--------|---------------|---------------------|
| `add` | Creates a node | No (creates are unique) | N/A |
| `move` | Changes parent pointer | Yes (concurrent moves) | LWW, deterministic |
| `delete` | Moves to trash | Yes (concurrent with add-to) | Merge both |

No operation depends on another operation's success. Each stands alone.

### 4.3 User Mental Model

**Before (hidden transaction):**
- User clicks "wrap"
- Sometimes extra empty nodes appear
- User confused: "I didn't create that"

**After (explicit operations):**
- User clicks "add container" → sees new container
- User drags node into container → understands it's a move
- If move conflicts → user sees empty container → "Someone else moved it first"
- User decides: delete the empty container, or use it for something else

The explicit model matches how CRDTs actually work.

---

## 5. Comparison with Database Transactions

### 5.1 Why Databases Can Have Transactions

Traditional databases (PostgreSQL, MySQL) provide ACID transactions because they are **CP systems**:

- Single server, or coordinated replicas
- Writes block until committed
- Unavailable during network issues to primary
- **Not local-first** — requires server connectivity

### 5.2 Eventually Consistent "Transactions"

Research has explored weaker transaction semantics for AP systems:

| System | What It Provides | What It Doesn't Provide |
|--------|------------------|------------------------|
| **Eventually Consistent Transactions** (Burckhardt et al., 2012) | Atomic visibility (see all or none of transaction's writes) | Atomic success/failure |
| **Cure** (Shapiro et al., 2016) | Causal consistency + atomic visibility | Rollback on conflict |
| **Red-Blue Consistency** | Mix of strong and weak operations | Full ACID for all operations |

**Key insight:** Even these systems don't provide "rollback the create if the move fails." They provide atomic *visibility*, not atomic *success*.

### 5.3 What CRDTs Provide

CRDTs provide **strong eventual consistency**:
- All replicas that have seen the same operations will be in the same state
- Operations are never rejected (append-only)
- Conflicts are resolved deterministically

This is weaker than transactions but compatible with partition tolerance.

---

## 6. Implementation

### 6.1 Remove Compound Operations

From `DenicekModel`:
```typescript
// DELETE
wrapNode(targetId: string, wrapperTag: string): string
```

From `DenicekDocument`:
```typescript
// DELETE
cleanupRedundantWrappers(): void

// DELETE from connectToSync
this.cleanupRedundantWrappers();
```

From `loroHelpers.ts`:
```typescript
// DELETE (no longer needed for cleanup)
areNodesConcurrent(...)
nodeCreationPrecedes(...)
opIdCausallyPrecedes(...)
```

### 6.2 Update API Consumers

Replace:
```typescript
const wrapperId = model.wrapNode(targetId, "div");
```

With:
```typescript
const parentId = model.getParent(targetId);
const wrapperId = model.addChild(parentId, { kind: "element", tag: "div" });
model.move(targetId, wrapperId, 0);
```

### 6.3 Document the Constraint

Add to API documentation:

> **Why is there no `wrapNode` operation?**
>
> Denicek is local-first software, which means it works offline and syncs changes later. This requires partition tolerance, which by the CAP theorem is incompatible with transactions.
>
> A `wrap` operation is secretly a transaction: create a wrapper AND move a node into it. If concurrent users both try to wrap the same node, one wrapper ends up empty. There's no way to automatically clean this up without risking deletion of legitimate nodes.
>
> Instead, use explicit `addChild` and `move` operations. This makes the two steps visible, so you can see when a move conflict occurred and decide what to do with your empty container.

---

## 7. Theoretical Summary

### 7.1 The Argument

1. **Local-first requires partition tolerance** (offline operation)
2. **CAP: partition tolerance excludes strong consistency**
3. **Transactions require strong consistency** (atomic commit)
4. **Therefore: local-first excludes transactions**
5. **CALM: detecting transaction failure requires coordination**
6. **Coordination is unavailable during partitions**
7. **Therefore: cleanup of failed transactions is impossible**
8. **Solution: don't use transactions; use single-effect primitives**

### 7.2 This Is Not a Bug

The impossibility of `wrap` is not:
- A limitation of Loro
- A limitation of CRDTs
- Something we can fix with a clever algorithm

It is a consequence of fundamental theorems (CAP, CALM) that apply to all distributed systems.

### 7.3 The Trade-off We Accept

By choosing local-first architecture, we accept:
- No multi-operation transactions
- Conflicts are resolved by merge rules, not prevented
- Users may need to manually resolve some situations

In exchange, we get:
- Works offline
- Instant local response
- No central point of failure
- Data ownership (your data is on your device)

This is the correct trade-off for a collaborative document editor.

---

## 8. Conclusion

The `wrap` operation attempted to provide transactional semantics (atomic create + move) in a local-first system. This is impossible by the CAP theorem: transactions require strong consistency, but local-first requires partition tolerance.

The principled solution is to eliminate compound operations and expose only single-effect primitives. This aligns the API with the system's actual guarantees and makes conflict resolution visible to users rather than hidden behind unreliable cleanup algorithms.

**Recommendation:** Remove `wrapNode` and `cleanupRedundantWrappers`. Document the explicit `addChild` + `move` pattern.

---

## References

### Distributed Systems Fundamentals

1. Brewer, E. (2000). *Towards Robust Distributed Systems.* PODC Keynote. — Introduced the CAP conjecture.
2. Gilbert, S., & Lynch, N. (2002). *Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services.* SIGACT News. — Formal proof of CAP theorem.

### Local-First Software

3. Kleppmann, M., Wiggins, A., van Hardenberg, P., & McGranaghan, M. (2019). *Local-First Software: You Own Your Data, in Spite of the Cloud.* Onward! — Defines local-first principles and their implications.

### CALM and Monotonicity

4. Hellerstein, J. M. (2010). *The Declarative Imperative: Experiences and Conjectures in Distributed Logic.* SIGMOD Record. — Introduced the CALM conjecture.
5. Ameloot, T. J., Neven, F., & Van den Bussche, J. (2013). *Relational Transducers for Declarative Networking.* Journal of the ACM. — Formal proof of CALM theorem.
6. Hellerstein, J. M., & Alvaro, P. (2020). *Keeping CALM: When Distributed Consistency is Easy.* Communications of the ACM. — Accessible overview.

### CRDTs

7. Shapiro, M., Preguiça, N., Baquero, C., & Zawirski, M. (2011). *Conflict-Free Replicated Data Types.* SSS'11. — Foundational CRDT paper.
8. Kleppmann, M., & Beresford, A. R. (2017). *A Conflict-Free Replicated JSON Datatype.* IEEE TPDS.

### Tree CRDTs and Move Semantics

9. Kleppmann, M., Mulligan, D. P., Gomes, V. B. F., & Beresford, A. R. (2021). *A Highly-Available Move Operation for Replicated Trees.* IEEE TPDS. — LWW move semantics.

### Transactions in Eventually Consistent Systems

10. Burckhardt, S., Leijen, D., Fähndrich, M., & Sagiv, M. (2012). *Eventually Consistent Transactions.* ESOP. — Weaker transaction semantics for EC systems.
11. Akkoorath, D. D., Tomsic, A. Z., Bravo, M., Li, Z., Crain, T., Bieniusa, A., Preguiça, N., & Shapiro, M. (2016). *Cure: Strong Semantics Meets High Availability and Low Latency.* ICDCS. — Strongest guarantees compatible with availability.

### Implementation

12. Loro CRDT Documentation. *Tree CRDT with LWW Move Semantics.*

---

## Appendix A: Proof of Indistinguishability

**Claim:** The CRDT state after two concurrent wraps of X is indistinguishable from the state after one peer creates an empty node while another peer wraps X.

**Scenario 1 (Concurrent wraps):**
- Peer A: `wrap(X)` → creates $W_A$, moves X into $W_A$
- Peer B: `wrap(X)` → creates $W_B$, moves X into $W_B$
- After merge (B wins): $W_A$ empty, $W_B$ contains X

**Scenario 2 (Independent empty + wrap):**
- Peer A: `add(parent, div)` → creates empty node $Z$
- Peer B: `wrap(X)` → creates $W$, moves X into $W$
- After merge: $Z$ empty, $W$ contains X

**Observation function:** $\phi(S) = (N, Edges, \parallel)$ where N is nodes, Edges is the parent-child relation, $\parallel$ is concurrency relation.

**Result:**
- $\phi(S_1) = (\{P, X, W_A, W_B\}, \{(P, W_A), (P, W_B), (W_B, X)\}, \{(W_A, W_B)\})$
- $\phi(S_2) = (\{P, X, Z, W\}, \{(P, Z), (P, W), (W, X)\}, \{(Z, W)\})$

Under renaming $W_A \mapsto Z$, $W_B \mapsto W$: $\phi(S_1) \cong \phi(S_2)$.

**Conclusion:** No algorithm examining only CRDT state can distinguish these scenarios. Cleanup would either delete legitimate empty nodes (Scenario 2) or keep orphaned wrappers (Scenario 1). $\square$

---

## Appendix B: Why "Atomic Visibility" Doesn't Help

Some systems (Cure, ECTs) provide **atomic visibility**: if you see any effect of a transaction, you see all effects.

This doesn't solve our problem because:

1. Both the `add` and `move` are visible to all replicas
2. The issue isn't visibility — it's that the `move` conflicted with another `move`
3. Atomic visibility doesn't prevent conflicts; it just ensures you see complete transactions
4. We still end up with an empty wrapper that shouldn't exist

Atomic visibility provides: "See all of {create W, move X→W} or none."

We need: "If move X→W fails, rollback create W."

The latter is **conditional rollback based on conflict detection**, which requires coordination.

---

## Appendix C: Could a Custom CRDT Make Wrap Atomic?

A natural question: could we design a different CRDT where `wrap` is truly atomic? The answer is yes, but you cannot escape the fundamental trade-off — you only get to choose *which* problem you have.

### Option 1: Wrapper Always Created

Design `wrap(X, tag)` as a single primitive that creates wrapper W and sets X.parent = W.

**Conflict resolution (LWW on move):** One move wins, X ends up in one wrapper.

**Result:** You still have an orphaned wrapper when the move loses. Same problem.

### Option 2: Wrapper Existence Tied to Move Outcome

Make the wrapper "virtual" — it only materializes if its move is winning:

```
wrap(X, tag) → Move(X, VirtualWrapper(tag))
```

If another move wins, the wrapper disappears.

**Problem: Race condition with concurrent additions.**

1. Peer A wraps X into W
2. Peer C (unaware of conflict) adds child Y to W
3. Peer B's concurrent move wins, W "disappears"
4. What happens to Y?

| Option | Consequence |
|--------|-------------|
| Y deleted | Destroys C's legitimate work |
| Y reparented to W's parent | Surprising, potentially wrong location |
| Y keeps W alive | Violates "losing wrapper disappears" rule |

This is the same race condition from Section 4.3 of the original cleanup analysis.

### Option 3: Different Data Model

Instead of a tree with parent pointers, make "wrapping" a computed property:

```
Node {
    id
    parent
    wrapWith: Option<Tag>  // "wrap me in this tag"
}
```

The wrapped view is computed, not stored. But now:
- Concurrent `wrapWith` updates conflict (LWW picks one)
- Interactions with concurrent moves create new edge cases
- More complex conflict resolution logic

### The Fundamental Constraint

`wrap` tries to link outcomes of two independent pieces of state:

| State | Can Conflict? | Resolution |
|-------|---------------|------------|
| Node set (wrapper exists) | No (creates have unique IDs) | Always succeeds |
| Parent pointer (X in W) | Yes (concurrent moves) | LWW |

**To link them**, you need: "Delete wrapper if move loses."

That requires detecting "move lost" — which is non-monotonic (absence detection).

By CALM: non-monotonic → requires coordination.

### Summary of Design Choices

| Design | Orphaned wrapper? | Risk of data loss? | Complexity |
|--------|-------------------|-------------------|------------|
| Explicit create + move | Yes (visible to user) | No | Low |
| Primitive wrap (always create) | Yes (same as above) | No | Medium |
| Virtual wrappers | No | Yes (concurrent children) | High |
| Wrap-as-property | N/A | No | High, new edge cases |

**Conclusion:** You can choose your trade-off, but you cannot avoid having one. The cleanest solution remains: don't pretend `wrap` is atomic. Expose the two operations explicitly.
