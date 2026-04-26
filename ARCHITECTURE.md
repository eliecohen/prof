# My Little Professor — Architecture & Design

## Stack

| Layer | Technology | Reason |
|---|---|---|
| Desktop shell | Electron | Mature, JS ecosystem, macOS native feel |
| Frontend | React | Complex UI state (tree, threads, active topic) |
| Backend | Node.js + Express | Single language across the stack, deployable for mobile later |
| LLM | Anthropic SDK (JS) or any OpenAI-compatible endpoint | User's own key, swappable in settings |
| Database | SQLite (better-sqlite3) | All structured data, single file, zero server |
| RAG / Embeddings (v2) | TBD | To be decided when Mode Learn is built |

**Note:** The prototype Python code (`prototype/`) is kept as reference — especially the system prompt in `agent.py` which is copied verbatim into the new backend. Nothing in `prototype/` is modified.

---

## Project Structure

```
learning-agent/
  backend/               ← Node.js + Express API server
    src/
      agent.js           ← LLM conversation logic + system prompt
      llm_client.js      ← provider abstraction (Anthropic / OpenAI-compatible)
      db.js              ← SQLite access layer (better-sqlite3)
      tree.js            ← topic tree management
      analysis.js        ← parallel calls (live analysis + drift detection)
    server.js            ← Express entry point
    package.json
  frontend/              ← React UI
    src/
      components/
        Tree/
        Conversation/
        Thread/
        SuggestionsPopup/
        ProfilePanel/
      App.jsx
    package.json
  electron/              ← Desktop shell only
    main.js              ← launches backend + opens window
    package.json
  prototype/             ← original Python prototype, never modified
  PRODUCT.md
  ARCHITECTURE.md
```

## Process Architecture

```
Electron (main process)
  ├── Launches backend/server.js on startup
  ├── Manages app lifecycle
  └── React renderer (UI)
        ↓ HTTP (localhost)
  Express server (Node.js)
        ├── agent.js       ← LLM logic + system prompt
        ├── llm_client.js  ← provider abstraction
        ├── db.js          ← SQLite
        ├── tree.js        ← tree management
        └── analysis.js    ← parallel background calls
        ↓
  Anthropic API (user's key)
```

## Electron Launch Sequence

```
User opens app
↓
electron/main.js starts
↓
Spawns: node backend/server.js
↓
Health check loop: GET localhost:3001/health (until 200)
↓
Opens React window
↓
On app quit: kills backend process
```

```javascript
// electron/main.js (simplified)
const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')

let backend

app.on('ready', async () => {
  backend = spawn('node', ['../backend/server.js'])
  await waitForBackend('http://localhost:3001/health')
  createWindow()
})

app.on('quit', () => backend.kill())
```

### Development
Three terminals:
```
npm run backend    ← node backend/server.js
npm run frontend   ← vite (React dev server)
npm run electron   ← electron (points to vite URL)
```

### Production packaging
`electron-builder` bundles everything into a single `.app`:
- Electron shell
- Node.js runtime
- `backend/` as `extraResources`
- `frontend/` built as static files served by the backend

The user sees one icon, one app. No terminal, no setup.

---

**Mobile path:** when a mobile app is needed, `backend/` is deployed as a standalone server (cloud or local). The React frontend is ported to React Native. `electron/` is the only layer that disappears.

---

## Data Model

### SQLite Schema

```sql
-- Who is using the app
CREATE TABLE profile (
  id               INTEGER PRIMARY KEY DEFAULT 1,
  first_name       TEXT,
  language         TEXT DEFAULT 'french',
  age              INTEGER,
  level            TEXT,
  interests        TEXT,              -- JSON array
  learning_style   TEXT,
  enriched_profile TEXT,              -- accumulated live analysis, injected into every Prof call
  tree_depth       INTEGER DEFAULT 2, -- number of category levels (1-5)
  auto_collapse    INTEGER DEFAULT 1, -- boolean
  provider         TEXT DEFAULT 'anthropic',
  base_url         TEXT DEFAULT 'https://api.anthropic.com',
  model            TEXT DEFAULT 'claude-sonnet-4-6',
  api_key          TEXT,
  created_at       TEXT
);

-- One row per usage period (app open → app close)
CREATE TABLE sessions (
  id                    TEXT PRIMARY KEY,
  started_at            TEXT,
  ended_at              TEXT,
  last_active_topic_id  TEXT REFERENCES topics(id)
);

-- All nodes in the tree: categories and conversations
CREATE TABLE topics (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,    -- 'category' | 'conversation'
  title           TEXT,
  parent_id       TEXT REFERENCES topics(id),
  status          TEXT DEFAULT 'grey',  -- grey | visited | active (conversations only)
  source          TEXT DEFAULT 'explore',   -- explore | learn
  book_id         TEXT REFERENCES books(id),
  session_created TEXT REFERENCES sessions(id),
  created_at      TEXT,
  last_visited    TEXT
  -- categories have no messages, conversations are always leaves
);

-- All messages (conversations only, never categories)
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  topic_id    TEXT REFERENCES topics(id),
  role        TEXT,   -- user | assistant
  content     TEXT,
  created_at  TEXT
);

-- Inline clarification threads (attached to a paragraph in a conversation)
CREATE TABLE threads (
  id          TEXT PRIMARY KEY,
  topic_id    TEXT REFERENCES topics(id),
  anchor_text TEXT,
  created_at  TEXT
);

-- Messages within threads
CREATE TABLE thread_messages (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT REFERENCES threads(id),
  role        TEXT,
  content     TEXT,
  created_at  TEXT
);

-- Uploaded books (v2 — Mode Learn only)
CREATE TABLE books (
  id          TEXT PRIMARY KEY,
  title       TEXT,
  file_path   TEXT,
  chroma_path TEXT,
  added_at    TEXT
);

-- Token usage per API call
CREATE TABLE usage (
  id            TEXT PRIMARY KEY,
  topic_id      TEXT REFERENCES topics(id),
  session_id    TEXT REFERENCES sessions(id),
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  created_at    TEXT
);

-- Junction: which conversations were visited in which session
CREATE TABLE session_topics (
  session_id  TEXT REFERENCES sessions(id),
  topic_id    TEXT REFERENCES topics(id),
  PRIMARY KEY (session_id, topic_id)
);
```

### Tree queries

```sql
-- Get root categories
SELECT * FROM topics WHERE parent_id IS NULL AND type = 'category';

-- Get children of a node (categories or conversations)
SELECT * FROM topics WHERE parent_id = ?;

-- Get all conversations (leaves) under a category recursively
WITH RECURSIVE subtree AS (
  SELECT * FROM topics WHERE id = ?
  UNION ALL
  SELECT t.* FROM topics t JOIN subtree s ON t.parent_id = s.id
)
SELECT * FROM subtree WHERE type = 'conversation';

-- Get full path to a node (breadcrumb)
WITH RECURSIVE path AS (
  SELECT * FROM topics WHERE id = ?
  UNION ALL
  SELECT t.* FROM topics t JOIN path p ON t.id = p.parent_id
)
SELECT * FROM path;

-- Get all conversations under a category (for context when generating suggestions)
SELECT * FROM topics WHERE type = 'conversation' AND parent_id = ?;

-- Reorganize: move a conversation or category to a new parent
UPDATE topics SET parent_id = ? WHERE id = ?;
```

---

## Local Storage Layout

```
~/.little-professor/
  ├── data.db          ← SQLite: all structured data (topics, messages, sessions, threads, profile)
  └── library/
        ├── {book_id}.pdf
        └── {book_id}/
              └── chroma/    ← ChromaDB index (embeddings only)
```

Single file to backup: `data.db`. Expected size: well under 500MB even after years of heavy use (1 message ≈ 2KB).

---

## API Endpoints

### Session

```
POST   /session/start          ← called on app open → creates session row
PATCH  /session/{id}/end       ← called on app close → sets ended_at
```

### Topics

```
POST   /topic/new              ← { title, parent_id } → create grey node from (+) popup
POST   /topic/{id}/message     ← send message, get Prof response
GET    /tree                   ← full tree for UI
PATCH  /topic/{id}/status      ← update status (grey → visited → active)
PATCH  /topic/{id}/move        ← { new_parent_id } → reorganize tree
DELETE /topic/{id}             ← delete grey node only (no conversation)
```

### Threads

```
POST   /thread/new             ← { topic_id, anchor_text } → create thread
POST   /thread/{id}/message    ← send clarification message
GET    /topic/{id}/threads     ← list threads for a topic
```

### Profile

```
GET    /profile
PATCH  /profile
```

### Suggestions (+ button)

```
POST   /suggestions            ← { subject: string } → returns 10 ephemeral suggestions
                                  never persisted, regenerated on each call
```

### Mode Learn (v2)

```
POST   /book/upload            ← PDF upload → ingest → return syllabus draft
POST   /book/{id}/confirm      ← { selected_topics, order } → create nodes in tree
GET    /books                  ← list uploaded books
```

---

## Context Assembly (per API call)

Each message to Claude receives:

```
[system prompt — agent.py]
[learner profile — static fields]
[enriched profile — accumulated live analysis]
[cross-topic summary]          ← titles of visited topics, max 10
[topic conversation history]   ← last 20 messages of active node
```

Thread context:
```
[system prompt]
[learner profile + enriched profile]
[anchor paragraph]
[last 3 exchanges from parent topic]
[thread conversation history]
```

---

## Parallel Calls (non-blocking)

Every exchange triggers two background calls in parallel with the Prof response:

**1. Live learner analysis**
After each Prof response, a lightweight call analyzes the exchange:
- Input: last 3 exchanges + current enriched profile
- Output: short delta update to enriched profile (reasoning style, engagement signals, effective analogies, tendencies)
- Written to `profile.enriched_profile` in SQLite
- Kept short — a few sentences max, not a full essay

**2. Subject drift detection**
After each user message, a lightweight call checks if the subject has changed:
- Input: active topic title + last user message
- Output: `{ drifted: bool, new_subject: string }`
- If drifted: creates a new black conversation node under the appropriate category, switches active topic silently
- The user sees the tree update without any interruption

Both calls are fire-and-forget — they never block the Prof response.

---

## RAG Pipeline (v2 — Mode Learn)

### Ingestion
1. PyMuPDF extracts text + structure from PDF
2. LLM call extracts syllabus (chapter titles, key concepts)
3. Text chunked (512 tokens, 50 overlap)
4. Embedded and stored in ChromaDB

### Retrieval
On each user message in Learn mode:
1. Query embedding generated
2. Top 3 chunks retrieved from ChromaDB
3. Injected into context as `[BOOK EXCERPT]` blocks

---

## Frontend State (React)

```javascript
{
  tree: Topic[],              // full tree (categories + conversations)
  activeTopicId: string,
  openThreadId: string | null,
  treePanelOpen: boolean,
  profile: Profile,
  isLoading: boolean,
  suggestionsPopup: {
    open: boolean,
    subject: string,
    suggestions: string[]
  }
}
```

### Layout

```
┌─────────────┬──────────────────────┬──────────────┐
│  Topic Tree │    Conversation       │   Thread     │
│  [(+)]      │  breadcrumb           │   (when open)│
│             │  ─────────────────    │              │
│  ▼ LLM      │  Prof: ...            │  anchor text │
│    ▼ Train  │  Elie: ...            │  ──────────  │
│      ● Attn │                       │  "not clear?"│
│    ○ Halluc │  [input]              │  [input]     │
│             │                       │              │
│  [token $]  │                       │              │
└─────────────┴──────────────────────┴──────────────┘
```

**Tree panel** — collapsible via the sidebar icon in the top-left toolbar (next to the traffic lights, as shown in the prototype). When collapsed, the conversation takes full width. Toggle state persists between sessions.

**Thread panel** — slides in from the right on single click on any Prof paragraph. Closes automatically when the user interacts with the main conversation or clicks a tree node.

---

## Provider Abstraction

All LLM calls go through `llm_client.py`. The `Agent` never imports `anthropic` or `openai` directly.

```python
# llm_client.py
class LLMClient:
    def __init__(self, provider, base_url, model, api_key):
        if provider == "anthropic":
            self.client = Anthropic(api_key=api_key)
            self.mode = "anthropic"
        else:
            self.client = OpenAI(base_url=base_url, api_key=api_key or "local")
            self.mode = "openai"
        self.model = model

    def create(self, system, messages, max_tokens, temperature):
        # Normalizes response + usage into a common format
        # Returns: { "text": str, "input_tokens": int, "output_tokens": int }
```

### Token tracking

Every `LLMClient.create()` call returns `input_tokens` + `output_tokens`. These are written to a `usage` table in SQLite and surfaced in the UI.

UI shows in bottom bar:
- Session: `↑ 12,400 tokens / ~$0.04`
- All-time: `↑ 2.1M tokens / ~$6.20`

Cost is estimated client-side using a static price table per model.

For local development: set `provider=openai-compatible`, `base_url=http://localhost:11434`, `model=llama3`, `api_key=` (empty).

---

## Key Design Decisions

**Why isolated context per topic?**
Sending the full history of all topics on every call is expensive and noisy. The Prof works better with a focused context. Cross-topic awareness is handled via a lightweight summary, not full history.

**Why SQLite over JSON files?**
All conversations are persisted across sessions in a single `data.db` file. JSON files require reading/rewriting the whole file on every update. SQLite gives transactional writes, cheap partial updates, and tree queries via recursive CTEs — all with zero server and a single file to backup.

**Why flat topics table with parent_id vs nested JSON?**
A deeply nested structure is hard to update atomically. Flat rows with parent_id let us move, update, or delete any single node with one SQL statement. The full tree is reconstructed in memory by the frontend.

**Why ChromaDB over sqlite-vec?**
ChromaDB has a simpler Python API for a first implementation. Can be swapped later — the RAG interface is isolated in `rag.py`.

**Why FastAPI as sidecar vs direct IPC?**
Keeps Python logic testable independently of Electron. Can also be used headlessly (CLI stays functional). Clear separation of concerns.
