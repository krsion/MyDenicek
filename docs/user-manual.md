# User Manual

**Project**: mydenicek — Local-first Collaborative Document Editor\
**Author**: Bc. Ondřej Krsička\
**Supervisor**: Mgr. Tomáš Petříček, Ph.D.

---

## 1. Introduction

mydenicek is a local-first collaborative document editor for structured,
tree-based documents. Documents are composed of nested tagged nodes — records,
lists, primitives, and references — edited via a terminal-style command bar and
synchronized in real time between peers using an
operational-transformation-based event DAG.

Key features:

- **Tagged document tree** — Documents are structured as a tree of four node
  types: records (tagged objects), lists (tagged arrays), primitives
  (string/number/boolean), and references.
- **Real-time collaboration** — Multiple users edit the same document
  simultaneously via room-based WebSocket sync.
- **Local-first** — The document works offline and synchronizes when
  connectivity is restored.
- **Command bar editing** — All editing is done through a terminal-style command
  bar with path-based selectors and tab completion.
- **Event DAG visualization** — Inspect the causal history of edits as a
  directed acyclic graph, with per-peer coloring and replay controls.
- **Programmable buttons** — Action buttons embedded in the document replay
  recorded edit sequences when clicked.

---

## 2. Getting Started

### 2.1 Accessing the Live Demo

Open the live demo in your browser:

> **<https://krsion.github.io/mydenicek/>**

No installation is required. The application runs entirely in the browser.

### 2.2 Running Locally

**Prerequisites:**

- [Deno](https://deno.com/) 2.x

**Steps:**

1. Clone the repository:
   ```bash
   git clone https://github.com/krsion/mydenicek.git
   cd mydenicek
   ```
2. Install dependencies:
   ```bash
   cd apps/mywebnicek && deno install
   ```
3. Start the development server (launches both the sync server and web app):
   ```bash
   deno task dev
   ```
4. Open your browser at **http://localhost:5173**.

### 2.3 Creating or Joining a Document

When you first open the app, a **landing page** is displayed. You have two
options:

- **Create from template** — Click one of the template buttons in the tab bar:
  - **+ Formative Examples** — Pre-built demo document with a counter,
    conference list, and table examples (see
    [Section 8](#8-formative-examples)).
  - **+ Empty** — A blank document with an empty root record.
- **Join an existing room** — Paste a shared URL containing a room ID in the
  hash (e.g., `https://krsion.github.io/mydenicek/#abc12345`) into your browser
  address bar.

Each template button creates a new tab and sets the URL hash to the new room ID.

---

## 3. Interface Overview

The interface is organized into four areas:

```
┌──────────────────────────────────────────────────────────────┐
│  Tabs:  [doc1]  [doc2]  │  + Formative Examples  │  + Empty │
├──────────────────────────────────────────────────────────────┤
│  mydenicek  [Document] [Raw JSON] [Event Graph]     Status  │
├────────────────────┬────────────────┬────────────────────────┤
│                    │                │                        │
│   Document Panel   │  Raw JSON      │    Event Graph         │
│   (rendered HTML)  │  Panel         │    Panel (SVG DAG)     │
│                    │                │                        │
├────────────────────┴────────────────┴────────────────────────┤
│  > /path command args                              [output]  │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 Tab Bar

The top bar shows open document tabs. Each tab displays the first 8 characters
of its room ID. Click a tab to switch to it. The active tab has a white
background; inactive tabs are gray. Template buttons appear after the open tabs.

### 3.2 Header Bar

Below the tabs, a light gray header bar contains:

- **"mydenicek"** title (left-aligned)
- **Panel toggle buttons**: **Document**, **Raw JSON**, **Event Graph**
  - Active panels have a blue background with white text
  - Inactive panels have a gray appearance
  - Click to toggle each panel on or off
- **Sync status** (right-aligned): a colored dot with status text, peer ID, and
  room ID
  - 🟢 **connected** — Synchronized with the server
  - 🟡 **connecting** — Connection attempt in progress
  - 🔴 **disconnected** — Connection lost
  - ⚪ **idle** — No sync server configured or sync disabled
- **Connect / Disconnect** button to toggle sync

### 3.3 Main Panels

Up to three panels display side by side in the main area. Each is independently
toggleable via the header buttons. See [Section 6](#6-panels) for details.

### 3.4 Command Bar

A terminal-style input bar at the bottom of the screen, prefixed with a blue `>`
prompt. This is the primary way to edit documents. See
[Section 5](#5-editing-with-the-command-bar) for full details.

---

## 4. Document Model

### 4.1 Node Types

Every document is a tree. Each node is one of four types:

#### Record Nodes

Tagged objects with named fields. A record has a **tag** (analogous to an HTML
element name, e.g., `section`, `h1`, `table`) and a set of **named child
fields**, each containing another node.

Example (JSON representation):

```json
{ "$tag": "article", "title": "Hello", "count": 42 }
```

#### List Nodes

Tagged ordered arrays. A list has a **tag** and a sequence of **indexed child
nodes** (accessed by numeric index starting at 0).

Example:

```json
{ "$tag": "ul", "$items": ["Apple", "Banana", "Cherry"] }
```

#### Primitive Nodes

Leaf nodes containing a single value: a **string**, **number**, or **boolean**.
Primitives cannot have children.

#### Reference Nodes

Nodes that point to another node via a `$ref` path. References resolve to the
current value at the target path and update automatically when the target
changes.

### 4.2 Selectors (Path Addressing)

Nodes are addressed by **selectors** — slash-separated paths from the document
root:

| Selector         | Meaning                                     |
| ---------------- | ------------------------------------------- |
| `/`              | The root node                               |
| `/title`         | The `title` field of the root record        |
| `/items/0`       | The first item in the `items` list          |
| `/items/2/name`  | The `name` field of the third list item     |
| `/items/*`       | All children of the `items` list (wildcard) |
| `/items/*/email` | The `email` field of every list item        |

The **wildcard** `*` expands to all children of a record or list, enabling batch
operations on multiple nodes at once.

### 4.3 Tags

Tags determine how nodes render in the Document panel. Standard HTML tags
(`h1`–`h6`, `p`, `table`, `tr`, `td`, `ul`, `li`, `button`, `input`, `article`,
`section`, etc.) render as their corresponding HTML elements. Unrecognized tags
render as `<div>`. Special tags:

- `button` — Renders as a clickable blue button. If the record contains an event
  script, clicking the button executes it.
- `input` — Renders as an editable text field. Changes auto-commit after a short
  delay.
- `x-formula-*` — Formula nodes that display a computed result with a `ƒ`
  indicator.

---

## 5. Editing with the Command Bar

The command bar at the bottom of the screen is the primary editing interface.

### 5.1 Syntax

```
/selector command [arguments...]
```

- Type a **selector** (path) to navigate to a node.
- Follow it with a **command name** and any required **arguments**.
- Commands without a selector (bare commands) apply globally.

### 5.2 Value Parsing

Arguments are parsed as follows:

- Text starting with `{` or `[` is parsed as **JSON** (objects/arrays)
- `true` / `false` → **boolean**
- Numeric strings → **number**
- Everything else → **string**

### 5.3 Commands for Record Nodes

| Command                          | Description                            |
| -------------------------------- | -------------------------------------- |
| `/path add <field> <value>`      | Add a named field with the given value |
| `/path delete <field>`           | Delete a named field                   |
| `/path rename <old> <new>`       | Rename a field                         |
| `/path updateTag <tag>`          | Change the record's tag                |
| `/path wrapRecord <field> <tag>` | Wrap the node in a new record          |
| `/path wrapList <tag>`           | Wrap the node in a new list            |
| `/path copy <source-path>`       | Copy a node from another path          |
| `/path formula <field> <op>`     | Add a formula node as a field          |

### 5.4 Commands for List Nodes

| Command                          | Description                         |
| -------------------------------- | ----------------------------------- |
| `/path pushBack <value>`         | Append an item to the end           |
| `/path pushFront <value>`        | Prepend an item to the beginning    |
| `/path popBack`                  | Remove the last item                |
| `/path popFront`                 | Remove the first item               |
| `/path insert <index> <value>`   | Insert at a specific index          |
| `/path remove <index>`           | Remove the item at a specific index |
| `/path updateTag <tag>`          | Change the list's tag               |
| `/path wrapRecord <field> <tag>` | Wrap the list in a new record       |
| `/path wrapList <tag>`           | Wrap the list in a new list         |
| `/path copy <source-path>`       | Copy a node from another path       |

### 5.5 Commands for Primitive Nodes

| Command                          | Description                                 |
| -------------------------------- | ------------------------------------------- |
| `/path set <value>`              | Set the primitive's value                   |
| `/path splitFirst [separator]`   | Extract text before separator (default `,`) |
| `/path splitRest [separator]`    | Extract text after separator (default `,`)  |
| `/path wrapRecord <field> <tag>` | Wrap the primitive in a record              |
| `/path wrapList <tag>`           | Wrap the primitive in a list                |

### 5.6 Inspection Commands

| Command      | Description                               |
| ------------ | ----------------------------------------- |
| `/path get`  | Show the value at the given path          |
| `/path tree` | Show the subtree rooted at the given path |
| `tree`       | Show the full document tree               |
| `help`       | Show available commands                   |

### 5.7 Global Commands

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `undo`             | Undo the last edit                       |
| `redo`             | Redo the last undone edit                |
| `repeat <eventId>` | Replay the edit from a specific event ID |

### 5.8 Formula Operations

When using the `formula` command, the following operations are available:

| Category   | Operations                                                                    |
| ---------- | ----------------------------------------------------------------------------- |
| **Math**   | `sum`, `product`, `mod`, `round`, `floor`, `ceil`, `abs`                      |
| **String** | `concat`, `uppercase`, `lowercase`, `capitalize`, `trim`, `length`, `replace` |
| **Tree**   | `countChildren`                                                               |

### 5.9 Examples

```
/counter/value set 42
/items pushBack {"$tag": "li", "text": "New item"}
/items/0/name set "Alice"
/speakers pushFront "Bob"
/title updateTag h2
/items/2 delete name
/data rename old_key new_key
/items wrapRecord wrapper section
undo
redo
tree
/counter/value get
```

---

## 6. Panels

### 6.1 Document Panel

Renders the tagged document tree as **live HTML**. The document is displayed
using semantic HTML elements based on each node's tag.

Interactive features:

- **Buttons** (nodes tagged `button`) — Rendered as blue clickable buttons.
  Clicking a button executes its associated event script (recorded edit
  sequence).
- **Input fields** (nodes tagged `input`) — Rendered as editable text inputs.
  Type directly into them; changes auto-commit after approximately 500ms.
- **Formulas** (nodes tagged `x-formula-*`) — Display computed results with a
  `ƒ(operation)` indicator.
- **References** — Display with an arrow indicator (`→`) in blue text.

### 6.2 Raw JSON Panel

Displays the complete document tree as **syntax-highlighted JSON**:

- 🔵 **Blue** — Property keys
- 🟢 **Green** — String values (teal for `$tag` values)
- 🟠 **Orange** — Numbers
- 🟣 **Purple** — Booleans and null
- ⚫ **Gray** — Structural characters (`{`, `}`, `[`, `]`)

This panel is read-only and is useful for inspecting the raw document structure.

### 6.3 Event Graph Panel

An **SVG visualization** of the causal event DAG (Directed Acyclic Graph). Each
edit to the document creates a node in the graph.

Visual features:

- **Per-peer coloring** — Each peer's events are drawn in a unique color.
- **Causal edges** — Lines connect each event to its causal parents.
- **Layout** — Concurrent events appear in the same row but different columns.
  Peer labels (first 6 characters of peer ID) appear at the top of each column.
- **Frontier nodes** — The latest events from each peer have thick black
  borders.
- **Selection** — Click a node to select it. The selected event shows with a
  white fill and thick colored border. Hovering shows the full event ID and
  description.

---

## 7. Collaborative Editing

### 7.1 Room-Based Sync

Documents are synchronized via **rooms**. Each document tab has a unique room ID
embedded in the URL hash (e.g., `https://krsion.github.io/mydenicek/#abc12345`).

The sync server uses WebSockets at:\
`wss://mydenicek-core-krsion-dev-sync.happyisland-d6dda219.westeurope.azurecontainerapps.io/sync`

### 7.2 Sharing a Document

To collaborate with others:

1. Open a document (or create one from a template).
2. Copy the URL from your browser's address bar — it contains the room ID in the
   hash.
3. Send this URL to your collaborators.
4. When they open the URL, they automatically join the same room and see the
   same document.

### 7.3 Sync Status

The header bar shows the current connection state:

| Indicator           | Meaning                           |
| ------------------- | --------------------------------- |
| 🟢 **connected**    | Synchronized with the sync server |
| 🟡 **connecting**   | Connection attempt in progress    |
| 🔴 **disconnected** | Connection lost                   |
| ⚪ **idle**         | Not connected to any sync server  |

The status also displays the current **peer ID** (your unique identifier in the
room) and the **room ID**.

Use the **Connect** / **Disconnect** button to toggle synchronization on or off.

### 7.4 Conflict Resolution

mydenicek uses a custom **operational transformation (OT)** algorithm over an
**event DAG** — not CRDTs. All peers that receive the same set of events
deterministically converge to the same document state, regardless of delivery
order.

Events are replayed in a deterministic topological order. Concurrent structural
edits (rename, wrap, delete) are resolved by transforming selectors through the
OT layer.

| Concurrent Operations                     | Resolution                        |
| ----------------------------------------- | --------------------------------- |
| Two users edit the same primitive         | Last-writer-wins (by event order) |
| Two users add children to the same parent | Both additions are applied        |
| Two users rename the same field           | Last-writer-wins                  |
| One user wraps, another edits inside      | OT transforms the inner edit path |
| Two users delete the same node            | Idempotent — deleted once         |

---

## 8. Formative Examples

The **"Formative Examples"** template creates a pre-built document demonstrating
the core features of mydenicek. It contains three sections:

### 8.1 Counter

A simple numeric counter with an **Increment** button.

- **Path**: `/counter/value` — holds the current count (starts at `0`)
- **Button**: "Increment" — executes a multi-step edit sequence:
  1. Wraps the counter value in a formula record (`x-formula-plus`)
  2. Renames the value field to `left`
  3. Adds a `right` field with value `1`
  4. The formula evaluates to the incremented counter

Try it: click the "Increment" button repeatedly and watch the counter increase.
You can also manually set the value: `/counter/value set 100`.

### 8.2 Conference List

A simple list with a text input and an **Add** button.

- **Input field**: Pre-filled with `"New Speaker, speaker@example.com"`
- **Button**: "Add" — copies the input text and inserts it as a new `<li>` at
  the top of the list
- **Pre-populated items**: "Tomáš Petříček, tomas@tomasp.net" and "Ada Lovelace,
  ada@example.com"

### 8.3 Conferences Table

A structured table with separate Name and Email columns.

- **Input field**: Pre-filled with `"Jan Novák, jan@novak.cz"`
- **Button**: "Add Speaker" — executes a 5-step sequence:
  1. Inserts a new `<tr>` with `<td>` cells
  2. Copies the input text to both cells
  3. Applies `splitFirst` on the name cell (extracts text before `,`)
  4. Applies `splitRest` on the email cell (extracts text after `,`)
- **Pre-populated rows**: Tomáš Petříček / tomas@tomasp.net and Ada Lovelace /
  ada@example.com

---

## 9. Keyboard Shortcuts & Tips

### 9.1 Command Bar Shortcuts

| Key            | Action                                                 |
| -------------- | ------------------------------------------------------ |
| **Tab**        | Auto-complete the current input; cycle through options |
| **Enter**      | Execute the command or accept the selected completion  |
| **Arrow Up**   | Previous command from history / previous completion    |
| **Arrow Down** | Next command from history / next completion            |
| **Escape**     | Close the completions dropdown                         |

### 9.2 Tips

- **Tab completion** works for both selectors (paths) and command names. Start
  typing a path and press Tab to cycle through available fields/indices.
- **Ghost text** appears in faded text showing the remaining required arguments
  for the current command.
- **Command history** is stored in the browser (up to 200 entries). Use Arrow
  Up/Down to recall previous commands.
- Use the **`tree`** command to see the full document structure and discover
  paths.
- Use **`/path get`** to inspect the value at any path before editing.
- The **wildcard** `*` in selectors lets you operate on all children at once,
  e.g., `/items/*/done set true` to mark all items as done.

---

## 10. Troubleshooting

### The document is empty when I open a shared link

The app waits for the sync server to deliver the document when joining a room.
If the connection is slow, the document may appear empty. Try refreshing the
page.

### Changes are not syncing

- Check the sync status indicator in the header bar. If it shows "disconnected"
  or "idle", click the **Connect** button.
- Ensure you and your collaborator are using the same URL (same room ID in the
  hash).
- Corporate firewalls may block WebSocket connections to the sync server.

### Undo doesn't revert a collaborator's change

Undo only affects your own local edits. Each peer's undo history is independent.

### A command returns an error

- Check that the **selector** points to an existing node (use `tree` or
  `/path get` to verify).
- Ensure you are using the right command for the **node type** — e.g., `set`
  only works on primitives; `pushBack` only works on lists.
- Check the **number of arguments** — the command bar shows ghost text hints for
  required parameters.
