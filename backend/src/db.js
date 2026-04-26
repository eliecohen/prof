import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'

const DATA_DIR = join(homedir(), '.little-professor')
mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(join(DATA_DIR, 'data.db'))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id               INTEGER PRIMARY KEY DEFAULT 1,
    first_name       TEXT,
    language         TEXT DEFAULT 'french',
    age              INTEGER,
    level            TEXT,
    interests        TEXT,
    learning_style   TEXT,
    enriched_profile TEXT,
    tree_depth       INTEGER DEFAULT 2,
    auto_collapse    INTEGER DEFAULT 1,
    tree_font_size   INTEGER DEFAULT 11,
    conv_font_size   INTEGER DEFAULT 13,
    max_tokens       INTEGER DEFAULT 2048,
    provider         TEXT DEFAULT 'anthropic',
    base_url         TEXT DEFAULT 'https://api.anthropic.com',
    model            TEXT DEFAULT 'claude-sonnet-4-6',
    api_key          TEXT,
    anthropic_api_key TEXT,
    openai_api_key   TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id                    TEXT PRIMARY KEY,
    started_at            TEXT DEFAULT (datetime('now')),
    ended_at              TEXT,
    last_active_topic_id  TEXT REFERENCES topics(id)
  );

  CREATE TABLE IF NOT EXISTS topics (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL,
    title           TEXT,
    parent_id       TEXT REFERENCES topics(id),
    status          TEXT DEFAULT 'grey',
    source          TEXT DEFAULT 'explore',
    book_id         TEXT,
    session_created TEXT REFERENCES sessions(id),
    created_at      TEXT DEFAULT (datetime('now')),
    last_visited    TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    topic_id    TEXT REFERENCES topics(id),
    role        TEXT,
    content     TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS threads (
    id          TEXT PRIMARY KEY,
    topic_id    TEXT REFERENCES topics(id),
    anchor_text TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS thread_messages (
    id          TEXT PRIMARY KEY,
    thread_id   TEXT REFERENCES threads(id),
    role        TEXT,
    content     TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage (
    id            TEXT PRIMARY KEY,
    topic_id      TEXT REFERENCES topics(id),
    session_id    TEXT REFERENCES sessions(id),
    model         TEXT,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS session_topics (
    session_id  TEXT REFERENCES sessions(id),
    topic_id    TEXT REFERENCES topics(id),
    PRIMARY KEY (session_id, topic_id)
  );

  INSERT OR IGNORE INTO profile (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS books (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    author     TEXT,
    year       INTEGER,
    subject    TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS book_chapters (
    id         TEXT PRIMARY KEY,
    book_id    TEXT REFERENCES books(id),
    number     INTEGER,
    title      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS book_sections (
    id         TEXT PRIMARY KEY,
    chapter_id TEXT REFERENCES book_chapters(id),
    number     INTEGER,
    title      TEXT NOT NULL,
    generated  INTEGER DEFAULT 0
  );
`)

// Migrate existing DBs
for (const col of [
  'tree_font_size INTEGER DEFAULT 11',
  'conv_font_size INTEGER DEFAULT 13',
  'anthropic_api_key TEXT',
  'openai_api_key TEXT',
  'max_tokens INTEGER DEFAULT 2048'
]) {
  try { db.exec(`ALTER TABLE profile ADD COLUMN ${col}`) } catch {}
}

export default db
