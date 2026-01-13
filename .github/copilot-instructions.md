# MyDenicek Copilot Instructions
### UI & Components
- **Framework:** React 19 with **Fluent UI** components (`@fluentui/react-components`).
- **Icons:** Uses `@fluentui/react-icons`.

### Development Workflow
- **Package Manager:** `npm`
- **Dev Server:** `npm run dev` (Vite)
- **Build:** `npm run build` (TSC + Vite)
- **Lint:** `npm run lint` (ESLint)
  - **Rules:**
    - **Imports:** Sorted automatically via `eslint-plugin-simple-import-sort`.
    - **Unused Code:** `unused-imports/no-unused-imports` is an error. Unused variables must be prefixed with `_`.
    - **No Any:** Usage of `any` is strictly prohibited. Use `unknown` or specific types instead.
- **Testing:**
  - Always write tests for new features and bug fixes.
  - Always test UI features in Playwright.
  - **E2E/Integration:** `npm run test` (Playwright).
  - **UI Mode:** `npm run test:ui`
  - Tests are located in `tests/` and configured in `playwright.config.ts`.


## `proposal/` (LaTeX)
- Standard LaTeX project structure.
- Main file: `proposal.tex`.

## Research Proposal Content
The following is the content of the research proposal, describing the goals and background of the project:

### Proposal of team software project
**Department of Software Engineering**
**Faculty of Mathematics and Physics, Charles University**

**Solvers:** Bc. Ondřej Krsička
**Study program:** Computer Science - Software and Data Engineering
**Project title:** Using CRDTs to enable collaborative editing in Denicek
**Project type:** Research project
**Supervisor:** Mgr. Tomáš Petříček, Ph.D.
**Expected start:** 1.11.2025
**Expected end:** 1.7.2026

### Introduction
*Denicek* [1] is a document-based end-user programming substrate that can be used as the basis for the implementation of different programming systems. One such programming system is the web-based system *Webnicek*. Internally, *Denicek* relies on synchronization between document versions and it currently uses Operational Transformation, which is error prone and complex and requires a central server for synchronization. This project will create *MyDenicek*, a backend built on top of CRDTs. This will make it easier to implement programming systems that follow the principles of local-first software. *MyWebnicek* will be a new web-based programming system built on top of the new substrate, providing functionality similar to *Webnicek*.

### Denicek end-user programming experiences
*Denicek: Computational Substrate for Document-Oriented End-User Programming* [1] provides the following end-user programming experiences:
- Collaborative editing
- Programming by demonstration (users can record actions and program a button to replay them on click)
- Incremental recomputation (formulas depending on changed values are invalidated and automatically recomputed)
- Schema change control (when a value is wrapped or unwrapped in an element, all references to it are updated)
- End-user debugging (values on which a formula depends can be highlighted for better understanding of the result)
- Concrete programming (copying and pasting formulas between contexts while preserving dependencies; when the original changes, the copied formula updates accordingly)

### Denicek usage
Two end-user programming environments are currently built on top of the *Denicek* substrate:
- *Webnicek*: for creating interactive HTML documents
- *Datnicek*: for data science use cases similar to Jupyter Notebooks

The use cases of Denicek are illustrated by the following formative examples:
- **Counter app:** The user creates a document with value 1, wraps it in a formula (1+1), records the process, and replays it on button click: producing a simple counter.
- **Todo app:** Similar to the counter app, but the recorded actions add text from an input field as a new list item.
- **Conference list:** Alice refactors a list of speakers from comma-separated items (name, email) into a table with columns (name, email). Meanwhile, Bob adds a new list item. The merged result is a table containing all speakers, including Bob’s addition.
- **Conference budget:** Building on the conference list, formulas depending on its values are automatically recomputed during refactoring.
- **Hello world:** The user makes the first line of a list of sentences lowercase, then capitalizes the first letter, copies the formula, and applies it to the whole list.
- **Traffic accidents:** Omitted from this research project, as it relates more closely to *Datnicek*.

### Limitations of Denicek and goals of this research project
The current *Denicek* synchronization layer is implemented using Operational Transformation (OT). However, OT is complex, error-prone, and requires a central synchronization server, which does not satisfy the requirements of local-first software [6].

The goal of this research project is to create an alternative to *Webnicek* built on top of a CRDT-based local-first substrate. The new system should support the same end-user programming experiences demonstrated by the formative examples, possibly using a revised set of primitive operations. It should also maintain a clear separation between the user interface and the CRDT substrate to enable future development of a *Datnicek* alternative based on the same backend.

The resulting systems will be called *MyDenicek* and *MyWebnicek*, inspired by *MyWebstrates* [7]: a local-first, CRDT-based alternative to Webstrates [8]. Both parts will be implemented in TypeScript.

The primary deliverable of the project will be the CRDT-based backend, *MyDenicek*, implemented as a reusable library. *MyWebnicek* will be developed as a prototype/demo application built on top of *MyDenicek*; it is intended as an illustrative demo rather than a fully production-ready web application.

#### MyWebnicek functional requirements
*MyWebnicek* will have the following functionalities:
- Renderer of the final document
- Navigation through the document
- Commandline for user to perform primitive actions
- History view of user edit actions
- Sharing mechanism for collaborative editing via network
- Conflict resolution interface

#### MyDenicek functional requirements
The core library (*MyDenicek*) will satisfy the following requirements:
- Provide a way of representing HTML-like structured documents similar to those in Denicek
- Expose an API for modifying the underlying document through edit actions similar to those in Denicek
- Provide a CRDT-based operation for merging divergent versions of the document
- Support a mechanism for detecting and resolving merge conflicts akin to Grove

### Schedule
The project is expected to run for 8 months. The expected schedule is:
- Task 1 (Studying of materials, analysis and prototyping) - Month 1-3
- Task 2 (Production-ready MyDenicek and MyWebnicek implementation) - Month 4-7
- Task 3 (Textual and Video Documentation) - Month 8
- Task 4 (Testing and evaluation) - Month 8

### Team structure
The work will be coordinated by the supervisor. The student will be responsible for the technical aspects of the project (developing the Grove encoding, prototype implementation) and evaluation. The design of the system will be developed in collaboration between the supervisor, the student and Jonathan Edwards (Denicek co-author).

### Related work
This work directly builds on the Denicek system presented at *ACM UIST 2025* [1]. It extends ongoing research on Conflict-free Replicated Data Types (CRDTs), as summarized in Preguiça’s overview [2], and is informed by practical open-source CRDT frameworks (Yjs, Automerge). The project will first investigate the applicability of Grove’s typed, patch-based model [3] to Denicek’s document structures and editing workflows, while keeping the option to adopt or hybridize with other CRDTs if Grove proves unsuitable for some features.

### References
1. T. Petříček, et al. *Denicek: Computational Substrate for Document-Oriented End-User Programming.* In Proceedings of the 38th Annual ACM Symposium on User Interface Software and Technology (UIST '25). no. 32, pp. 1--19.
2. N. Preguiça. *Conflict-free Replicated Data Types: An Overview.* 2018. https://arxiv.org/abs/1806.10254.
3. M. D. Adams, et al. *Grove: A Bidirectionally Typed Collaborative Structure Editor Calculus.* ACM, 2024. DOI: https://doi.org/10.1145/3704909.
4. A. Cypher, et al. (eds.) Watch what I do: programming by demonstration. MIT Press, 1993.
5. J. Edwards, et al. Schema Evolution in Interactive Programming Systems. The Art, Science, and Engineering of Programming, 9(1), 2-1. 2024.
6. M. Kleppmann, et al. Local-first software: you own your data, in spite of the cloud. Proceedings of the 2019 ACM SIGPLAN International Symposium on New Ideas, New Paradigms, and Reflections on Programming and Software. 2019.
7. Clemens Nylandsted Klokmose, James R. Eagan, and Peter van Hardenberg. 2024. MyWebstrates: Webstrates as Local-first Software. In Proceedings of the 37th Annual ACM Symposium on User Interface Software and Technology (UIST '24). Association for Computing Machinery, New York, NY, USA, Article 42, 1–12. https://doi.org/10.1145/3654777.3676445
8. Clemens N. Klokmose, James R. Eagan, Siemen Baader, Wendy Mackay, and Michel Beaudouin-Lafon. 2015. Webstrates: Shareable Dynamic Media. In Proceedings of the 28th Annual ACM Symposium on User Interface Software & Technology (UIST '15). Association for Computing Machinery, New York, NY, USA, 280–290. https://doi.org/10.1145/2807442.2807446

### Appendix: Denicek document structure
A *Denicek document* is a tree composed of named nodes of the following kinds:
- Ordered lists of nodes: all items are of the same type and addressable by index
- Records: children can be of different types and are addressable by their name
- References to other locations in the document
- Primitives: numeric or textual values

### Appendix: Denicek programs
A *Denicek program* is represented as a history of primitive actions. Histories can be replayed, merged, and compared, with conflict detection between them.

Primitive actions that do not affect references include:
- Add to record
- Append to list
- Reorder list
- Delete item from list
- Update tag of list or record
- Edit a primitive value (text or number)

Primitive actions that *do* affect references include:
- Rename a record
- Delete a record
- Wrap a node in a record
- Wrap a node in a list
- Copy node(s) from given selectors to specified target(s)
