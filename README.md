# My Little Professor

A local Electron desktop app that acts as a Socratic learning companion. It organizes your learning into a topic tree and guides you through each subject with Socratic dialogue — asking questions, adapting to your level, and building real understanding.

## Philosophy

Rather than dumping information, the Professor:
- Asks questions that force you to think
- Detects your level and adapts
- Challenges without being condescending
- Makes learning active, not passive
- Works for any domain (science, philosophy, tech, history, etc.)

## Features

- **Topic tree** — organize learning into subjects, chapters, and sections
- **Socratic conversations** — the Prof opens each topic with a question, not a lecture
- **Book import** — search real books, pick chapters, build a tree from the TOC automatically
- **Threads** — click any paragraph to open a clarification thread
- **Multi-provider** — works with Anthropic (Claude) or any OpenAI-compatible API (LM Studio, Ollama, etc.)
- **Persistent memory** — conversations saved locally in SQLite

## Stack

- **Frontend** — React + Vite
- **Backend** — Node.js / Express + SQLite (better-sqlite3)
- **Desktop** — Electron
- **AI** — Anthropic SDK + OpenAI-compatible SDK

## Getting Started

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install
cd ../electron && npm install

# Start everything
cd ..
./start.sh
```

On first launch, open the settings (⚙️) and enter your API key and name.

## Project Structure

```
backend/    — Express API, SQLite DB, LLM client
frontend/   — React UI (tree, conversation, book picker)
electron/   — Electron shell
start.sh    — Start backend + frontend + Electron
```
