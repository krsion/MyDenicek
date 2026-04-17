---- MODULE MydenicekCRDT ----
\*
\* TLA+ specification of the mydenicek pure operation-based CRDT for
\* collaborative tree-structured document editing.
\*
\* The system is modelled as a bounded set of peers that create events
\* (edits), store them in a grow-only set (G-Set), and synchronize by
\* sending their full event set to other peers.  The document is
\* materialized by replaying events in a deterministic topological
\* order with operational-transformation-style conflict resolution.
\*
\* This spec verifies Strong Eventual Consistency (SEC):
\*   Peers that hold the same event set always materialize the same
\*   document.
\*
\* For a full description see the master thesis, Chapter 3-4.
\*

EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    Peers,       \* Set of peer identifiers (model values)
    MaxSeq,      \* Maximum events per peer
    FieldNames,  \* Set of field name strings
    p1, p2, p3   \* Individual peer constants for ordering

ASSUME Peers \subseteq {p1, p2, p3}
ASSUME Peers # {}
ASSUME MaxSeq \in Nat \ {0}
ASSUME FieldNames # {}

(* ================================================================ *)
(* Values and types                                                  *)
(* ================================================================ *)

NULL == "NULL"

\* Small value domain to keep state space tractable
ValueSet == {"v1", "v2"}

\* Peer ordering for deterministic topological sort tie-breaking.
\* p1 < p2 < p3 by convention; mirrors lexicographic peer-name order
\* used in the real implementation.
PeerRank(p) == IF p = p1 THEN 1 ELSE IF p = p2 THEN 2 ELSE 3

\* Compare event IDs: TRUE iff a precedes b in the canonical order.
\* EventId is a pair <<peer, seq>>.
IdLT(a, b) ==
    \/ PeerRank(a[1]) < PeerRank(b[1])
    \/ (a[1] = b[1] /\ a[2] < b[2])

(* ================================================================ *)
(* Edit types                                                        *)
(* ================================================================ *)

\* RecordAdd: set a field to a value in the root record
AddEdit(f, v) == [type |-> "Add", field |-> f, value |-> v]

\* RecordRename: rename field `from` to `to` in the root record
RenameEdit(f1, f2) == [type |-> "Rename", from |-> f1, to |-> f2]

\* ListPushBack: append a value to a field (simplified as set in flat model)
PushBackEdit(f, v) == [type |-> "PushBack", field |-> f, value |-> v]

\* The universe of edits that any peer may produce
AllEdits ==
    LET AllRenames == {RenameEdit(fa, fb) : fa \in FieldNames, fb \in FieldNames}
    IN {AddEdit(f, v) : f \in FieldNames, v \in ValueSet}
       \cup {re \in AllRenames : re.from # re.to}
       \cup {PushBackEdit(f, v) : f \in FieldNames, v \in ValueSet}

\* The empty document: every field is NULL
EmptyDoc == [f \in FieldNames |-> NULL]

(* ================================================================ *)
(* State variables                                                   *)
(* ================================================================ *)

VARIABLES
    events,    \* Peer -> Set of Event records  (G-Set per peer)
    nextSeq,   \* Peer -> 1..MaxSeq+1           (next sequence number)
    channels   \* Set of in-flight sync messages

vars == <<events, nextSeq, channels>>

(* ================================================================ *)
(* Frontier                                                          *)
(* ================================================================ *)

\* The frontier of an event set: event IDs with no descendants.
FrontierIds(evSet) ==
    LET ids      == {e.id : e \in evSet}
        hasChild == {pid \in ids : \E e \in evSet : pid \in e.parents}
    IN ids \ hasChild

(* ================================================================ *)
(* Ancestor computation  (transitive closure of parent edges)        *)
(* ================================================================ *)

\* Compute ids ∪ {all ancestor event IDs reachable via parents}.
\* Terminates because the DAG is acyclic and finite.
RECURSIVE AncClosure(_, _)
AncClosure(ids, evSet) ==
    LET parentSet == UNION {
            IF \E e \in evSet : e.id = eid
            THEN (CHOOSE e \in evSet : e.id = eid).parents
            ELSE {}
            : eid \in ids}
        novel == parentSet \ ids
    IN IF novel = {} THEN ids
       ELSE AncClosure(ids \cup novel, evSet)

\* eid1 happens-before eid2  (eid1 is a causal ancestor of eid2)
HB(eid1, eid2, evSet) ==
    /\ eid1 # eid2
    /\ eid1 \in AncClosure({eid2}, evSet)

\* eid1 and eid2 are causally concurrent
IsConcurrent(eid1, eid2, evSet) ==
    /\ eid1 # eid2
    /\ ~HB(eid1, eid2, evSet)
    /\ ~HB(eid2, eid1, evSet)

(* ================================================================ *)
(* Edit transformation  (Operational Transformation)                 *)
(* ================================================================ *)

\* Transform `edit` to account for a concurrent `prior` that was
\* applied earlier in the canonical replay order.
\*
\* Key rule (from the mydenicek CRDT):
\*   If prior is Rename(from -> to), rewrite the field reference in
\*   any concurrent edit that targets `from` so it targets `to`.
XForm(prior, edit) ==
    IF prior.type = "Rename" THEN
        CASE edit.type = "Add" ->
             IF edit.field = prior.from
             THEN AddEdit(prior.to, edit.value)
             ELSE edit
        []   edit.type = "PushBack" ->
             IF edit.field = prior.from
             THEN PushBackEdit(prior.to, edit.value)
             ELSE edit
        []   edit.type = "Rename" ->
             IF edit.from = prior.from
             THEN RenameEdit(prior.to, edit.to)
             ELSE edit
        []   OTHER -> edit
    ELSE edit   \* Non-structural priors do not transform selectors

(* ================================================================ *)
(* Topological sort  (Kahn's algorithm, EventId min-heap)            *)
(* ================================================================ *)

\* Pick the event with the smallest EventId from a non-empty set.
MinEvent(S) == CHOOSE e \in S : \A e2 \in S : ~IdLT(e2.id, e.id)

\* Produce a sequence of events in canonical topological order.
\* `emitted` is the set of event IDs already placed in the sequence.
RECURSIVE TopoSort(_, _)
TopoSort(remaining, emitted) ==
    IF remaining = {} THEN <<>>
    ELSE
        LET ready == {e \in remaining : e.parents \subseteq emitted}
            next  == MinEvent(ready)
        IN <<next>> \o TopoSort(remaining \ {next}, emitted \cup {next.id})

(* ================================================================ *)
(* Edit resolution  (transform through concurrent priors)            *)
(* ================================================================ *)

\* Walk the `applied` sequence and transform `edit` through each
\* entry that is concurrent with event `evId`.
RECURSIVE Resolve(_, _, _, _)
Resolve(evId, edit, applied, evSet) ==
    IF applied = <<>> THEN edit
    ELSE
        LET prior   == Head(applied)
            rest    == Tail(applied)
            xedit   == IF IsConcurrent(prior.id, evId, evSet)
                       THEN XForm(prior.edit, edit)
                       ELSE edit
        IN Resolve(evId, xedit, rest, evSet)

(* ================================================================ *)
(* Apply an edit to the flat-record document                         *)
(* ================================================================ *)

ApplyEdit(edit, doc) ==
    CASE edit.type = "Add" ->
         [doc EXCEPT ![edit.field] = edit.value]
    []   edit.type = "PushBack" ->
         [doc EXCEPT ![edit.field] = edit.value]
    []   edit.type = "Rename" ->
         IF doc[edit.from] # NULL
         THEN [f \in FieldNames |->
                 IF f = edit.to   THEN doc[edit.from]
                 ELSE IF f = edit.from THEN NULL
                 ELSE doc[f]]
         ELSE doc   \* Source field empty: no-op
    []   OTHER -> doc

(* ================================================================ *)
(* Materialization                                                   *)
(* ================================================================ *)

\* Replay sorted events applying OT, returning the final document.
\* `applied` accumulates [id, edit] records for concurrency checks.
RECURSIVE Replay(_, _, _, _, _)
Replay(sorted, idx, doc, applied, evSet) ==
    IF idx > Len(sorted) THEN doc
    ELSE
        LET ev       == sorted[idx]
            resolved == Resolve(ev.id, ev.edit, applied, evSet)
            newDoc   == ApplyEdit(resolved, doc)
        IN Replay(sorted, idx + 1, newDoc,
                  Append(applied, [id |-> ev.id, edit |-> resolved]),
                  evSet)

\* Materialize an event set into a flat-record document.
Materialize(evSet) ==
    IF evSet = {} THEN EmptyDoc
    ELSE Replay(TopoSort(evSet, {}), 1, EmptyDoc, <<>>, evSet)

(* ================================================================ *)
(* Actions                                                           *)
(* ================================================================ *)

\* ---------- LocalEdit ----------
\* A peer creates a new event whose parents are its current frontier.
LocalEdit(peer) ==
    \E edit \in AllEdits :
        LET seq     == nextSeq[peer]
            eid     == <<peer, seq>>
            parents == FrontierIds(events[peer])
            ev      == [id |-> eid, parents |-> parents, edit |-> edit]
        IN /\ seq <= MaxSeq
           /\ events'  = [events EXCEPT ![peer] = @ \cup {ev}]
           /\ nextSeq' = [nextSeq EXCEPT ![peer] = seq + 1]
           /\ UNCHANGED channels

\* ---------- SendSync ----------
\* A peer sends all its events to another peer.
\* Guard: the sender has events the receiver lacks.
SendSync(from, to) ==
    /\ from # to
    /\ events[from] \ events[to] # {}
    /\ LET msg == [src |-> from, dst |-> to, payload |-> events[from]]
       IN channels' = channels \cup {msg}
    /\ UNCHANGED <<events, nextSeq>>

\* ---------- ReceiveSync ----------
\* A peer receives a message and merges the events (G-Set union).
ReceiveSync(peer) ==
    \E msg \in channels :
        /\ msg.dst = peer
        /\ events'   = [events EXCEPT ![peer] = @ \cup msg.payload]
        /\ channels' = channels \ {msg}
        /\ UNCHANGED nextSeq

(* ================================================================ *)
(* Specification                                                     *)
(* ================================================================ *)

Init ==
    /\ events   = [p \in Peers |-> {}]
    /\ nextSeq  = [p \in Peers |-> 1]
    /\ channels = {}

Next ==
    \/ \E p \in Peers : LocalEdit(p)
    \/ \E p1x, p2x \in Peers : SendSync(p1x, p2x)
    \/ \E p \in Peers : ReceiveSync(p)

Spec     == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(Next)

(* ================================================================ *)
(* Invariants                                                        *)
(* ================================================================ *)

\* Type invariant
TypeOK ==
    /\ \A p \in Peers : nextSeq[p] \in 1..(MaxSeq + 1)
    /\ \A p \in Peers : \A e \in events[p] :
         /\ e.id[1] \in Peers
         /\ e.id[2] \in 1..MaxSeq
         /\ e.parents \subseteq {ev.id : ev \in events[p]}

\* Causal closure: every parent of a stored event is also stored
CausalClosure ==
    \A p \in Peers : \A e \in events[p] :
        \A pid \in e.parents : \E ep \in events[p] : ep.id = pid

\* ----- Strong Eventual Consistency (SEC) -----
\* If two peers hold the same event set they materialize the same doc.
\* Because Materialize is a deterministic pure function this is
\* trivially true in TLA+, but model-checking it exercises the full
\* materialization pipeline on every reachable event set and catches
\* bugs (e.g. CHOOSE-from-empty-set) that would make the function
\* partial.
Convergence ==
    \A px, py \in Peers :
        events[px] = events[py] =>
            Materialize(events[px]) = Materialize(events[py])

\* G-Set monotonicity is implicit: the only event-set mutation is
\* union, which never shrinks the set.

(* ================================================================ *)
(* Liveness  (requires FairSpec)                                     *)
(* ================================================================ *)

\* Under weak fairness, all peers eventually hold the same events.
EventualConvergence ==
    <>(\A px, py \in Peers : events[px] = events[py])

====
