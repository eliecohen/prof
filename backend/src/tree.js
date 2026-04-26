import db from './db.js'
import { v4 as uuid } from 'uuid'

export function getTree() {
  const nodes = db.prepare('SELECT * FROM topics ORDER BY created_at ASC').all()
  return buildTree(nodes)
}

function buildTree(nodes) {
  const map = {}
  const roots = []

  for (const node of nodes) {
    map[node.id] = { ...node, children: [] }
  }

  for (const node of nodes) {
    if (node.parent_id && map[node.parent_id]) {
      map[node.parent_id].children.push(map[node.id])
    } else {
      roots.push(map[node.id])
    }
  }

  return roots
}

export function createTopic({ type, title, parentId = null, status = 'grey', sessionId = null, bookId = null }) {
  const id = uuid()
  db.prepare(`
    INSERT INTO topics (id, type, title, parent_id, status, session_created, book_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, type, title, parentId, status, sessionId, bookId)
  return db.prepare('SELECT * FROM topics WHERE id = ?').get(id)
}

export function getTopic(id) {
  return db.prepare('SELECT * FROM topics WHERE id = ?').get(id)
}

export function updateTopicStatus(id, status) {
  db.prepare("UPDATE topics SET status = ?, last_visited = datetime('now') WHERE id = ?").run(status, id)
}

export function moveTopic(id, newParentId) {
  db.prepare('UPDATE topics SET parent_id = ? WHERE id = ?').run(newParentId, id)
}

export function deleteTopic(id) {
  const topic = getTopic(id)
  if (!topic) return false
  deleteSubtree(id)
  return true
}

function deleteSubtree(id) {
  const children = db.prepare('SELECT id FROM topics WHERE parent_id = ?').all(id)
  for (const child of children) deleteSubtree(child.id)
  const threads = db.prepare('SELECT id FROM threads WHERE topic_id = ?').all(id)
  for (const t of threads) {
    db.prepare('DELETE FROM thread_messages WHERE thread_id = ?').run(t.id)
  }
  db.prepare('DELETE FROM threads WHERE topic_id = ?').run(id)
  db.prepare('DELETE FROM messages WHERE topic_id = ?').run(id)
  db.prepare('DELETE FROM usage WHERE topic_id = ?').run(id)
  db.prepare('DELETE FROM session_topics WHERE topic_id = ?').run(id)
  db.prepare('DELETE FROM topics WHERE id = ?').run(id)
}

export function getTopicMessages(topicId, limit = 20) {
  return db.prepare(`
    SELECT * FROM messages WHERE topic_id = ?
    ORDER BY created_at ASC LIMIT ?
  `).all(topicId, limit)
}

export function saveMessage({ topicId, role, content }) {
  const id = uuid()
  db.prepare(`
    INSERT INTO messages (id, topic_id, role, content)
    VALUES (?, ?, ?, ?)
  `).run(id, topicId, role, content)
  return id
}

export function getVisitedTopics() {
  return db.prepare(`
    SELECT * FROM topics WHERE type = 'conversation' AND status != 'grey'
    ORDER BY last_visited DESC
  `).all()
}

export function getBreadcrumb(topicId) {
  const path = db.prepare(`
    WITH RECURSIVE path AS (
      SELECT * FROM topics WHERE id = ?
      UNION ALL
      SELECT t.* FROM topics t JOIN path p ON t.id = p.parent_id
    )
    SELECT * FROM path
  `).all(topicId)
  return path.reverse()
}

export function findOrCreateCategory({ title, parentId = null }) {
  const existing = db.prepare(`
    SELECT * FROM topics WHERE type = 'category' AND title = ? AND parent_id IS ?
  `).get(title, parentId)
  if (existing) return existing
  return createTopic({ type: 'category', title, parentId, status: 'active' })
}
