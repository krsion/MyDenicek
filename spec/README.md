# Mydenicek CRDT — TLA+ Specification

A bounded TLA+ model of the **mydenicek** pure operation-based CRDT for
collaborative tree-structured document editing.

## What the spec verifies

| Property | Kind | Description |
|---|---|---|
| **TypeOK** | Invariant | Event IDs, sequence numbers, and parent references are well-typed. |
| **CausalClosure** | Invariant | If an event is stored at a peer, all its causal ancestors are stored too. |
| **Convergence** (SEC) | Invariant | Peers holding the same event set always materialize the same document. Exercises the full materialization pipeline (topological sort → OT transformation → apply) on every reachable state. |
| **EventualConvergence** | Liveness | Under weak fairness on `Next`, all peers eventually hold the same event set. *(optional, requires `FairSpec`)* |

### Model overview

The document is abstracted as a flat record `[FieldName → Value ∪ {NULL}]`.
Three edit types are modelled:

| Edit | Semantics |
|---|---|
| `RecordAdd(field, value)` | Set a field to a value |
| `RecordRename(from, to)` | Move the value from one field to another |
| `ListPushBack(field, value)` | Set a field value (flat-model simplification of list append) |

The key **transformation rule** mirrors the real implementation:
when a `RecordRename(from → to)` is concurrent with another edit that
targets field `from`, the target is rewritten to `to`.

Peers synchronize by sending their full event set (G-Set) to other peers.
The receiver merges via set union — events are immutable and never deleted.

## How to run

### Prerequisites

* **Java 11+** (JRE or JDK)
* **tla2tools.jar** — download from
  <https://github.com/tlaplus/tlaplus/releases> (look for `tla2tools.jar`
  under Assets)

### Command-line TLC

```bash
# Place tla2tools.jar next to the spec/ directory, then:
java -jar tla2tools.jar -config spec/MydenicekCRDT.cfg spec/MydenicekCRDT.tla
```

### TLA+ Toolbox (GUI)

1. Open the TLA+ Toolbox.
2. **File → Open Spec → Add New Spec…** → select `spec/MydenicekCRDT.tla`.
3. Create a new model:
   - Assign `p1`, `p2`, `p3` as **model values**.
   - Set `Peers = {p1, p2, p3}`, `MaxSeq = 3`, `FieldNames = {"a", "b", "c"}`.
   - Add `TypeOK`, `CausalClosure`, `Convergence` as invariants.
4. Click **Run**.

### VS Code TLA+ extension

Install the [TLA+ extension](https://marketplace.visualstudio.com/items?itemName=alygin.vscode-tlaplus)
and use the built-in model checker.

## Expected output

TLC reports:

```
Model checking completed. No error has been found.
```

All three invariants hold in every reachable state.

### Verified configuration (2 peers, MaxSeq = 2, 2 fields)

```
Peers = {p1, p2}, MaxSeq = 2, FieldNames = {"a", "b"}
  → 34,735,481 states generated
  → 11,461,961 distinct states
  → depth 16, completed in ~7 minutes (20 workers)
  → No errors found
```

The default `MydenicekCRDT.cfg` uses 3 peers / MaxSeq = 3 / 3 fields
for broader coverage.  This configuration exercises far more concurrent
scenarios but requires substantially more time (hours+).

## Bounds and state-space estimates

| Parameter | Default | Notes |
|---|---|---|
| Peers | 3 | Number of replicas |
| MaxSeq | 3 | Max events per peer (9 total) |
| FieldNames | 3 | `{"a", "b", "c"}` |
| ValueSet | 2 | `{"v1", "v2"}` (hard-coded) |
| Edit types | 3 | Add, Rename, PushBack |

Each peer can produce up to `MaxSeq` events, choosing from
`|FieldNames| × |ValueSet|` Add edits +
`|FieldNames| × (|FieldNames|-1)` Rename edits +
`|FieldNames| × |ValueSet|` PushBack edits = **18 edits** per step
(with 3 fields / 2 values).

| Configuration | Distinct states | Time estimate |
|---|---|---|
| 2 peers, MaxSeq=2, 2 fields | ~11.5M | ~7 min |
| 3 peers, MaxSeq=2, 2 fields | very large | hours |
| 3 peers, MaxSeq=3, 3 fields | enormous | days+ |

For a quick check, reduce bounds in the `.cfg` file.  Going beyond
MaxSeq=3 is not recommended without symmetry reduction or distributed
TLC.

## How to extend

### Add more edit types

1. Define a new edit constructor (e.g. `DeleteEdit(f)`).
2. Add it to `AllEdits`.
3. Add a clause to `ApplyEdit`.
4. If the edit is **structural** (changes field layout), add
   transformation rules to `XForm`.

### Increase bounds

In `MydenicekCRDT.cfg`, change:

```
MaxSeq = 4          \* more events per peer
FieldNames = {"a", "b", "c", "d"}   \* more fields
```

### Add liveness checking

Replace `SPECIFICATION Spec` with `SPECIFICATION FairSpec` in the cfg and
add:

```
PROPERTY EventualConvergence
```

### Nested document model

The current spec uses a flat record.  To model the full tree:

1. Replace `EmptyDoc` with a recursive tree type.
2. Extend `ApplyEdit` to navigate selectors.
3. Extend `XForm` with selector-prefix matching (wrap/unwrap, list
   index shifting).
