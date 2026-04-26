# My Little Professor — Product Requirements

## Vision

A local, open-source app that puts you in direct conversation with an expert. Not a course, not a quiz — a Socratic dialogue that develops curiosity and deep thinking. The Prof adapts to who you are and remembers where you've been.

---

## Core Principles

- **Think for yourself** — the goal is active thinking, not passive reception. The Prof never just delivers answers — it makes the learner construct, predict, and question.
- **Conversation first** — learning happens through dialogue, not content consumption
- **Curiosity over completion** — the goal is to want to know more, not to finish a curriculum
- **Privacy by default** — everything stays on the user's machine
- **Own your API key** — no subscription, no server, no data collection

---

## Conversation Display

Messages are displayed with names:
```
Elie:  j'aimerais comprendre comment fonctionne l'attention mechanism
Prof:  Tu connais déjà les transformers ou je commence par les bases ?
```

The user's first name comes from the profile. "Prof" is always "Prof" regardless of language.

---

## The Professor

The Prof is a calm, precise expert. Style: modern Socrates.

- Always top-down: overview before mechanisms
- Short exchanges (ping-pong), never long monologues
- Asks questions before revealing answers
- Forces prediction, generation, construction — never passive consumption
- Detects disengagement and injects paradoxes or tangents
- Adapts to learner profile (age, language, level, interests)
- Acknowledges insights with restraint, never hyperbolic

The Prof's pedagogy is defined by a system prompt (existing in `agent.py`) and refined empirically over time.

---

## User Profile

Set once at onboarding, editable anytime via the profile panel.

**Required fields (app won't work without them):**
- **First name** — used in conversation display (`Elie:`)
- **API key** — required to call the LLM

**Optional fields:**
- **Language** — French, English (others later)
- **Age** — adapts vocabulary and analogies
- **Level** — beginner / intermediate / advanced (per domain, not global)
- **Interests** — used for analogies ("the Prof knows you like biology")

**Onboarding:** on first launch, if required fields are missing, the profile panel opens automatically. The user cannot start a conversation until the required fields are filled.

The profile is injected into every API call. The Prof uses it as a starting point but adapts in real-time to conversation signals.

---

## The Topic Tree

The left panel. A persistent map of the user's intellectual journey.

### Two node types

The tree has two fundamentally different node types:

| Type | Role | Editable | Has conversation |
|---|---|---|---|
| **Category** | Organizational container | Yes — rename, move, restructure | No |
| **Conversation** | A real learning exchange | No — content is immutable | Yes |

**Categories are always parents. Conversations are always leaves.** A conversation can never have children.

This separation means the tree can be freely reorganized at any time — rename, move, or add category levels — without touching the conversation content. The conversations are the source of truth. Categories are just scaffolding around them.

### Tree depth

The structure is always:
```
Category 1
  └── Category 2 (optional)
        └── ...
              └── Conversation   ← always the leaf
```

The number of category levels is configurable in the profile panel (min: 1, max: 5, default: 2):
- **1 level:** `LLM › Attention mechanism`
- **2 levels (default):** `LLM › Training › Attention mechanism`
- **3+ levels:** for users who want finer organization

Categories are generated automatically by the LLM. If a required category doesn't exist yet, it is created automatically. The user can reorganize freely via drag-and-drop at any time.

**Tree reorganization (v2):** A "Reorganize" button in the tree panel will let the model analyze the tree and propose a new structure when categories get too dense. The user confirms before anything moves.

### Node states (conversations only)

| State | Visual | Meaning |
|---|---|---|
| Active | Highlighted (background color) | Currently open |
| Visited | Black | Past conversation, resumable |

The active node is always visible — if inside a collapsed branch, it auto-expands. A breadcrumb in the conversation header shows the current position: `LLM › Training › Attention mechanism`.

**Auto-collapse (configurable, on by default):** when navigating, unrelated branches collapse automatically. Only the active path stays expanded.

### How nodes are created

Two ways a node can be created:

1. **Via (+) popup** — user-initiated, creates grey nodes that become black after the first user reply
2. **Via subject drift** — Prof detects a new subject mid-conversation, creates a black node automatically (see "Changing subject mid-session")

**Mode Learn (v2):** Paved way anchored on a document. Not in v1.

### The (+) button

Two (+) buttons, same popup mechanic:

| (+) | Location | Pre-fills text field with |
|---|---|---|
| In the tree header | Global | Empty (user must type) |
| On a category | Next to category title | That category's name |

See "Core Flow" for full popup behavior.

### Tree editing

The user can at any time:
- Rename a category
- Move a conversation to a different category
- Add or remove a category level
- Reorder nodes within a category

Conversations themselves cannot be renamed or deleted — they are permanent records of learning.

### Navigation

- Click any conversation node to open it
- On app reopen: restores the last active node

### New Conversation

The "New Conversation" button (or `Cmd+N`) opens the (+) popup directly. The user picks or types a subject, a node is created, and the Prof starts.

---

## Threads

Inline clarification without losing the main conversation.

### Opening a thread
A single click anywhere on a paragraph in the Prof's response → thread panel slides in from the right automatically. No text selection, no double-click, no right-click — one click is the only interaction. The whole paragraph is the anchor.

### Visual indicators
Paragraphs that already have a thread attached show a subtle visual marker (e.g. a left border or a small dot). This lets the user know a parenthesis was opened there before and they can reopen it by clicking.

### Flow
```
Click on paragraph → thread panel opens
↓
Anchor text shown at top of thread panel
↓
"What's not clear?" prompt
↓
User explains the confusion
↓
Prof responds with full context
```

### Auto-close
The thread panel closes automatically when:
- The user types or sends a message in the **main conversation**
- The user clicks a node in the **topic tree**

It stays open as long as the user is interacting inside the thread panel itself.

### Reopening
Clicking a paragraph that already has a thread reopens that thread directly — no "what's not clear?" prompt, the existing conversation is shown and the user can continue.

### Context passed to thread
- The anchor paragraph (full text)
- The last 3 exchanges of the parent topic conversation
- The active topic node title

Threads are persistent — saved in SQLite under their parent topic and accessible across sessions.

---

## Core Flow (v1)

The tree is always the starting point. The user chooses what to learn before the conversation begins. The Prof never has to guess the subject.

### First launch (empty tree)

1. App opens → tree is empty → only the (+) button is available
2. User clicks (+) → popup opens with a text field: "What do you want to learn?"
3. User types a subject (e.g. "LLM") → 10 flat suggestions generated
4. User unchecks what they don't want, can add custom topics via the input field
5. User clicks OK → selected topics added to tree as grey nodes, automatically organized into categories
6. User clicks a grey node → Prof starts the conversation immediately (first message is always the Prof's)
7. Node turns black only after the user replies for the first time

### Returning (tree has nodes)

1. App opens → last active node highlighted
2. User clicks any node to resume, or clicks (+) to add new subjects

### The (+) button behavior

| Context | Behavior |
|---|---|
| No node selected, empty tree | Text field only — user must type a subject |
| Node selected | Proposes 10 suggestions related to that node's category |
| User types in the text field | Ignores selected node — generates suggestions around what was typed |

The text field always overrides the context. It's the escape hatch to go somewhere completely different without changing the active node.

**Popup contents:**
- Text field — pre-filled with the current topic if one is selected (e.g. "LLM"), but fully editable. Type anything ("Philo de Kant", "black holes") → regenerates 10 suggestions around that subject.
- 10 checkable suggestions
- "More suggestions" button — regenerates 10 new suggestions around the same subject, replaces the current ones
- OK button — adds checked suggestions to the tree as grey nodes

The popup only adds. Managing existing grey nodes (deleting, renaming) is done directly in the tree via right-click.

### Changing subject mid-session

**Via the tree:** The user clicks a different node — conversation switches instantly.

**Via the conversation:** If the user drifts to a new subject mid-conversation, the Prof detects it silently, creates a new black node in the tree under the appropriate category, and continues the conversation there. No interruption, no confirmation prompt — the transition is seamless. The node is black immediately since a conversation already exists in it.

### Grey nodes lifecycle

- **Created** when user confirms the (+) popup
- **Turn black** when user sends their first reply in that conversation
- **Deleted** manually — right-click → remove (does not delete any conversation since no conversation exists yet)

---

## Mode Learn (v2)

> Not in v1. Documented here for future reference.

Structured mode anchored on a document. The user uploads a PDF, the LLM generates a syllabus as a curated list of conversation nodes (paved way). The user reorders, removes topics, and confirms before starting. Each conversation injects relevant RAG passages from the PDF. The Prof teaches from the book, not just general knowledge.

---

## Memory

### Per-topic (isolated)
Each node has its own conversation history. Switching nodes switches context. The Prof does not carry the full history of all topics — only the active one.

### Cross-topic (lightweight)
A summary of visited topics is injected into every call. The Prof can make connections: "we saw something similar when we studied synaptic plasticity."

### Live learner analysis
After every exchange, a lightweight parallel call (non-blocking, few tokens) analyzes the interaction and updates the enriched profile. This is not the static profile — it's a living understanding of how this person thinks and learns.

What it extracts and accumulates:
- Reasoning style (Why-digger, What-if explorer, How-builder)
- What engaged vs disengaged the learner
- Analogies and framings that landed well
- Recurring tendencies ("always brings it back to philosophy", "loses interest when too mathematical", "responds well to concrete examples")

The enriched profile is injected into every Prof call. Over time the Prof becomes progressively better calibrated to this specific person — more challenging where they're strong, more patient where they struggle, using the framings they respond to best.

---

## Profile Panel

One panel for everything. Opened via the gear icon (top right). Opens automatically on first launch if required fields are missing.

### Identity
- **First name** — used in conversation display
- **Language** — French, English (others later)
- **Age** — adapts vocabulary and analogies
- **Level** — beginner / intermediate / advanced
- **Interests** — used for analogies

### LLM
- **Provider** — `anthropic` or `openai-compatible`
- **Base URL** — e.g. `http://localhost:11434` for Ollama
- **Model** — e.g. `claude-sonnet-4-6`, `llama3`, `mistral`
- **API Key** — empty for local models

### Tree preferences
- **Category depth** — 1 or 2 levels (default: 2)
- **Auto-collapse** — on by default

### Token usage
- Session: `↑ 12,400 tokens / ~$0.04`
- All-time: `↑ 2.1M tokens / ~$6.20`
- Read-only, displayed at the bottom of the profile panel and as a discreet counter in the main bottom bar

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `Cmd+N` | New Conversation — opens the (+) popup |
| `Cmd+B` | Toggle tree panel |
| `ESC` | Open help popup |

---

## Error Handling

Errors surface as a popup. No inline error states. Optimized later.

---

## Open Source / Distribution

- Fully local — no server, no account
- User provides their own API key (Anthropic or other provider)
- Data stored in `~/.little-professor/`
- Open source on GitHub
- Packaged as a native desktop app (macOS first, Windows later)
