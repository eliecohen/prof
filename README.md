# My Little Professor

A local desktop app that puts you in direct conversation with a Socratic learning companion. Not a course, not a quiz — a dialogue that develops curiosity and deep thinking.

The Professor adapts to who you are, remembers where you've been, and makes you think rather than just absorb.

---

## How it works

You build a **topic tree** on the left — subjects, chapters, sections. Click any node to start a conversation. The Prof opens with a question, not a lecture. You go back and forth. Click any paragraph to open a clarification **thread** in a side panel without losing the main conversation.

Add new topics with the `+` button, or import a real book — search by title, pick chapters, and the tree is built automatically from the table of contents.

---

## Features

- **Topic tree** — organize learning into subjects and chapters, add nodes at any level
- **Socratic conversations** — the Prof always starts with a question, adapts to your level in real time
- **Threads** — click any paragraph to open an inline clarification, saved and resumable
- **Book import** — search books, pick chapters (with auto-generated sections if unavailable), build the tree in one click
- **Live learner profile** — after each exchange, a background call updates an accumulated understanding of how you think and learn
- **Multi-provider** — Anthropic (Claude) or any OpenAI-compatible API (LM Studio, Ollama, etc.)
- **Fully local** — SQLite, no cloud, no account, your data stays on your machine

---

## Stack

| Layer | Technology |
|---|---|
| Desktop | Electron |
| Frontend | React + Vite |
| Backend | Node.js / Express |
| Database | SQLite (better-sqlite3) |
| AI | Anthropic SDK / OpenAI-compatible SDK |

---

## Getting Started

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install
cd ../electron && npm install
cd ..

# Start everything
./start.sh
```

On first launch, click ⚙️ and enter your first name and API key. The app won't start a conversation until those are set.

---

## Project structure

```
backend/        Node.js API server, SQLite, LLM client
  src/
    agent.js        system prompt + conversation logic
    llm_client.js   provider abstraction (Anthropic / OpenAI-compatible)
    db.js           SQLite schema + migrations
    tree.js         topic tree management
    analysis.js     parallel background calls (learner analysis, drift detection)
  server.js         Express entry point

frontend/       React UI
  src/
    components/
      Tree/               topic tree panel
      Conversation/       main conversation panel
      Thread/             inline clarification panel
      SuggestionsPopup/   + button popup (topics or chapters)
      BookPicker/         book search + TOC picker
      ProfilePanel/       settings, API key, font sizes

electron/       Desktop shell — launches backend, opens window
start.sh        Starts backend + frontend dev server + Electron
```

---

## Data

Everything is stored in `~/.little-professor/data.db` (SQLite). One file to back up.

The tree, all conversations, threads, token usage, and the learner profile are all in that single file.

---

## API key

You bring your own key. No subscription, no data collection.

- **Anthropic:** get a key at console.anthropic.com
- **Local models:** set provider to `openai-compatible`, point base URL to your local server (LM Studio, Ollama, etc.), leave the key empty

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+B` | Toggle tree panel |
| `Cmd+N` | Open topic/chapter suggestions |
| `Enter` | Send message |
| `Esc` | Close popup / thread |
