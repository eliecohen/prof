import express from 'express'
import cors from 'cors'
import { v4 as uuid } from 'uuid'
import db from './src/db.js'
import { LLMClient } from './src/llm_client.js'
import { buildSystemPrompt, buildCrossTopicSummary } from './src/agent.js'
import {
  getTree, createTopic, getTopic, updateTopicStatus, moveTopic, deleteTopic,
  getTopicMessages, saveMessage, getVisitedTopics, getBreadcrumb, findOrCreateCategory
} from './src/tree.js'
import { runParallelAnalysis, extractCategories } from './src/analysis.js'

const app = express()
app.use(cors())
app.use(express.json())

function parseJSON(text) {
  const clean = (text || '').trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    // Try to extract first complete JSON object or array from the text
    const objMatch = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
    if (objMatch) return JSON.parse(objMatch[1])
    throw new Error('No valid JSON found')
  }
}

function getLLMClient() {
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get()
  const provider = profile.provider || 'anthropic'
  const apiKey = provider === 'anthropic'
    ? (profile.anthropic_api_key || profile.api_key)
    : (profile.openai_api_key || profile.api_key)
  return new LLMClient({
    provider,
    baseUrl: profile.base_url,
    model: profile.model || 'claude-sonnet-4-6',
    apiKey
  })
}

function logUsage({ topicId, sessionId, model, inputTokens, outputTokens }) {
  const validSession = sessionId && db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId)
  db.prepare(`
    INSERT INTO usage (id, topic_id, session_id, model, input_tokens, output_tokens)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), topicId, validSession ? sessionId : null, model, inputTokens, outputTokens)
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }))

// ── Session ───────────────────────────────────────────────────────────────────

app.post('/session/start', (_req, res) => {
  const id = uuid()
  db.prepare('INSERT INTO sessions (id) VALUES (?)').run(id)
  res.json({ id })
})

app.patch('/session/:id/end', (req, res) => {
  const { lastActiveTopicId } = req.body
  db.prepare('UPDATE sessions SET ended_at = datetime("now"), last_active_topic_id = ? WHERE id = ?')
    .run(lastActiveTopicId || null, req.params.id)
  res.json({ ok: true })
})

// ── Profile ───────────────────────────────────────────────────────────────────

app.get('/profile', (_req, res) => {
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get()
  res.json(profile)
})

app.patch('/profile', (req, res) => {
  const fields = req.body
  const keys = Object.keys(fields)
  if (!keys.length) return res.json({ ok: true })
  const set = keys.map(k => `${k} = ?`).join(', ')
  db.prepare(`UPDATE profile SET ${set} WHERE id = 1`).run(...Object.values(fields))
  res.json(db.prepare('SELECT * FROM profile WHERE id = 1').get())
})

// ── Tree ──────────────────────────────────────────────────────────────────────

app.get('/tree', (_req, res) => {
  res.json(getTree())
})

app.post('/topic/new', async (req, res) => {
  const { title, parentId, sessionId, subject, isChapter } = req.body
  if (!title) return res.status(400).json({ error: 'title required' })

  if (isChapter) {
    // Ensure the subject root category exists, then create chapter category + intro topic
    const root = findOrCreateCategory({ title: subject || title, parentId: null })
    const chapter = findOrCreateCategory({ title, parentId: root.id })
    const intro = createTopic({
      type: 'conversation',
      title: `Introduction — ${title}`,
      parentId: chapter.id,
      status: 'grey',
      sessionId: sessionId || null
    })
    return res.json({ topic: intro, tree: getTree() })
  }

  // Section under an existing chapter: flat, no category creation
  const topic = createTopic({
    type: 'conversation',
    title,
    parentId: parentId || null,
    status: 'grey',
    sessionId: sessionId || null
  })
  res.json({ topic, tree: getTree() })
})

app.patch('/topic/:id/status', (req, res) => {
  const { status } = req.body
  updateTopicStatus(req.params.id, status)
  res.json({ ok: true })
})

app.patch('/topic/:id/move', (req, res) => {
  const { newParentId } = req.body
  moveTopic(req.params.id, newParentId)
  res.json({ tree: getTree() })
})

app.delete('/topic/:id', (req, res) => {
  try {
    const ok = deleteTopic(req.params.id)
    if (!ok) return res.status(400).json({ error: 'Topic not found' })
    res.json({ tree: getTree() })
  } catch (e) {
    console.error('[DELETE /topic]', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.delete('/tree', (_req, res) => {
  db.prepare('DELETE FROM thread_messages').run()
  db.prepare('DELETE FROM threads').run()
  db.prepare('DELETE FROM messages').run()
  db.prepare('DELETE FROM usage').run()
  db.prepare('DELETE FROM session_topics').run()
  db.prepare('DELETE FROM topics').run()
  res.json({ ok: true })
})

app.get('/topic/:id/breadcrumb', (req, res) => {
  res.json(getBreadcrumb(req.params.id))
})

// ── Conversation ──────────────────────────────────────────────────────────────

app.post('/topic/:id/message', async (req, res) => {
  try {
    const { content, sessionId } = req.body
    const topicId = req.params.id

    const topic = getTopic(topicId)
    if (!topic) return res.status(404).json({ error: 'Topic not found' })

    const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get()
    const llm = getLLMClient()

    // Save user message
    if (content) {
      saveMessage({ topicId, role: 'user', content })
      // First user reply — mark topic as visited
      if (topic.status === 'grey') updateTopicStatus(topicId, 'visited')
    }

    const messages = getTopicMessages(topicId)
    const visitedTopics = getVisitedTopics()

    const systemPrompt = buildSystemPrompt(profile) + buildCrossTopicSummary(visitedTopics)

    const formattedMessages = messages
      .filter(m => m.content && m.content.trim())
      .map(m => ({ role: m.role, content: m.content }))

    // API requires: non-empty array ending with a user message
    let messagesForLLM = formattedMessages
    if (messagesForLLM.length === 0 || messagesForLLM.at(-1).role !== 'user') {
      messagesForLLM = [...messagesForLLM, { role: 'user', content: `Start the conversation on the topic: "${topic.title}"` }]
    }


    const { text, inputTokens, outputTokens } = await llm.create({
      system: systemPrompt,
      messages: messagesForLLM,
      maxTokens: profile.max_tokens || 2048
    })

    saveMessage({ topicId, role: 'assistant', content: text })
    logUsage({ topicId, sessionId, model: profile.model, inputTokens, outputTokens })

    // Fire-and-forget parallel analysis
    const allMessages = getTopicMessages(topicId)
    runParallelAnalysis({
      llmClient: llm,
      topicId,
      topicTitle: topic.title,
      messages: allMessages,
      sessionId
    }).catch(() => {})

    res.json({ text, inputTokens, outputTokens, tree: getTree() })
  } catch (err) {
    console.error('message handler error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/topic/:id/messages', (req, res) => {
  res.json(getTopicMessages(req.params.id))
})

// ── Threads ───────────────────────────────────────────────────────────────────

app.post('/thread/new', (req, res) => {
  const { topicId, anchorText } = req.body
  const id = uuid()
  db.prepare('INSERT INTO threads (id, topic_id, anchor_text) VALUES (?, ?, ?)').run(id, topicId, anchorText)
  res.json(db.prepare('SELECT * FROM threads WHERE id = ?').get(id))
})

app.post('/thread/:id/message', async (req, res) => {
  const { content } = req.body
  const threadId = req.params.id

  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(threadId)
  if (!thread) return res.status(404).json({ error: 'Thread not found' })

  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get()
  const llm = getLLMClient()

  if (content) {
    db.prepare('INSERT INTO thread_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)')
      .run(uuid(), threadId, 'user', content)
  }

  const parentMessages = getTopicMessages(thread.topic_id, 6)
  const threadMessages = db.prepare('SELECT * FROM thread_messages WHERE thread_id = ? ORDER BY created_at ASC').all(threadId)

  const systemPrompt = buildSystemPrompt(profile)
  const context = `You are in a clarification thread. The learner selected this paragraph:\n"${thread.anchor_text}"\n\nParent conversation context (last exchanges):\n${parentMessages.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}\n\nNow help clarify the selected paragraph specifically.`

  const { text, inputTokens, outputTokens } = await llm.create({
    system: systemPrompt + '\n\n' + context,
    messages: threadMessages.map(m => ({ role: m.role, content: m.content }))
  })

  db.prepare('INSERT INTO thread_messages (id, thread_id, role, content) VALUES (?, ?, ?, ?)')
    .run(uuid(), threadId, 'assistant', text)

  logUsage({ topicId: thread.topic_id, sessionId: null, model: profile.model, inputTokens, outputTokens })

  res.json({ text, inputTokens, outputTokens })
})

app.get('/topic/:id/threads', (req, res) => {
  const threads = db.prepare('SELECT * FROM threads WHERE topic_id = ? ORDER BY created_at ASC').all(req.params.id)
  res.json(threads)
})

app.get('/thread/:id/messages', (req, res) => {
  res.json(db.prepare('SELECT * FROM thread_messages WHERE thread_id = ? ORDER BY created_at ASC').all(req.params.id))
})

// ── Suggestions ───────────────────────────────────────────────────────────────

app.post('/suggestions', async (req, res) => {
  const { subject, ignoreTree, parentId, parentTitle } = req.body
  if (!subject) return res.status(400).json({ error: 'subject required' })

  const llm = getLLMClient()

  let contextLine = ''
  if (!ignoreTree) {
    const existingTitles = db.prepare("SELECT title FROM topics").all().map(t => t.title)
    if (existingTitles.length > 0) {
      contextLine = `\nAlready in tree: ${existingTitles.slice(-40).join(', ')}\nNo duplicates.`
    }
  }

  let prompt
  if (parentId) {
    // Under a chapter: suggest sections (topics) for that chapter
    const existingSections = db.prepare("SELECT title FROM topics WHERE parent_id = ?").all(parentId).map(t => t.title)
    const existing = existingSections.length > 0 ? `\nSections already in this chapter: ${existingSections.join(', ')}\nDo NOT suggest duplicates.` : ''
    prompt = `Chapter: "${parentTitle || subject}" (part of "${subject}")${existing}${contextLine}\n\nSuggest exactly 8 specific section topics for this chapter.\nEach title 3-7 words, concrete and focused on one concept.\nRespond with JSON array only: ["title1", "title2", ...]`
  } else {
    // Root: suggest chapters
    const existingChapters = db.prepare("SELECT title FROM topics WHERE type = 'category' AND parent_id = (SELECT id FROM topics WHERE title = ? AND type = 'category' LIMIT 1)").all(subject).map(t => t.title)
    const existing = existingChapters.length > 0 ? `\nChapters already in tree: ${existingChapters.join(', ')}\nDo NOT suggest duplicates.` : ''
    prompt = `Subject: "${subject}"${existing}${contextLine}\n\nSuggest exactly 8 chapter titles that structure a learning path for "${subject}".\nEach chapter title 2-5 words, ordered from fundamentals to advanced.\nRespond with JSON array only: ["Chapter 1 title", "Chapter 2 title", ...]`
  }

  const { text } = await llm.create({
    system: 'You suggest learning structure. Respond only with valid JSON.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 400,
    temperature: 0.7
  })

  let suggestions = []
  try { suggestions = parseJSON(text) } catch { suggestions = [] }

  res.json({ suggestions, isChapter: !parentId })
})

// ── Books ─────────────────────────────────────────────────────────────────────

app.get('/books', async (req, res) => {
  const { q, exclude } = req.query
  if (!q) return res.json([])

  try {
    const excludeList = exclude ? exclude.split('|').filter(Boolean) : []
    const excludeLine = excludeList.length > 0
      ? `\nDo NOT include these books (already shown): ${excludeList.join('; ')}`
      : ''

    const llm = getLLMClient()
    const { text } = await llm.create({
      system: 'You suggest real, well-known books. Respond only with valid JSON.',
      messages: [{
        role: 'user',
        content: `List 5 real, well-known books about "${q}". Only include books you are confident exist with correct authors and years.${excludeLine}\nRespond with JSON array only: [{"title": "...", "author": "...", "year": 2023}, ...]`
      }],
      maxTokens: 600,
      temperature: 0.7
    })

    let books = []
    try { books = parseJSON(text) } catch { books = [] }
    if (!Array.isArray(books)) books = []

    const result = books.map(b => {
      const id = uuid()
      db.prepare('INSERT OR REPLACE INTO books (id, title, author, year, subject) VALUES (?, ?, ?, ?, ?)')
        .run(id, b.title, b.author, b.year, q.toLowerCase())
      return { id, ...b }
    })
    res.json(result)
  } catch (e) {
    console.error('[GET /books] error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.get('/book/:id/toc', async (req, res) => {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id)
  if (!book) return res.status(404).json({ error: 'Book not found' })

  const llm = getLLMClient()

  // Step 1: fetch chapters only (fast, small response)
  const { text: chapText } = await llm.create({
    system: 'You retrieve book tables of contents. Respond only with valid JSON.',
    messages: [{
      role: 'user',
      content: `Book: "${book.title}" by ${book.author} (${book.year}).\nList the real chapter numbers and titles only.\nRespond with JSON only:\n{"known": true, "chapters": [{"number": 1, "title": "..."}, ...]}\nIf you don't know this book's chapters: {"known": false, "chapters": []}`
    }],
    maxTokens: 800,
    temperature: 0
  })

  let toc
  try { toc = parseJSON(chapText) } catch {
    return res.status(422).json({ error: 'Could not parse TOC', usable: false })
  }

  if (!toc.known || !toc.chapters?.length) {
    return res.json({ book, chapters: [], usable: false })
  }

  // Step 2: all sections in one call, compact format
  const chapterList = toc.chapters.map(ch => `${ch.number}:${ch.title}`).join('\n')
  const { text: secText } = await llm.create({
    system: 'You are a book expert. Respond only with valid JSON.',
    messages: [{
      role: 'user',
      content: `Book: "${book.title}" by ${book.author}.\nFor EVERY chapter, give 3-4 section titles (real if known, invented if not).\nChapters:\n${chapterList}\n\nCompact JSON only — arrays keyed by chapter number, no extra fields:\n{"1":["s1","s2","s3"],"2":["s1","s2"],...}`
    }],
    maxTokens: 2500,
    temperature: 0.3
  })

  let sectionsMap = {}
  try {
    const parsed = parseJSON(secText)
    if (typeof parsed === 'object' && !Array.isArray(parsed)) sectionsMap = parsed
  } catch { sectionsMap = {} }

  const chapters = toc.chapters.map(ch => {
    const chId = uuid()
    db.prepare('INSERT OR REPLACE INTO book_chapters (id, book_id, number, title) VALUES (?, ?, ?, ?)').run(chId, book.id, ch.number, ch.title)

    const key = String(ch.number)
    const raw = sectionsMap[key]
    const titles = Array.isArray(raw) ? raw : (raw?.titles || [])
    const isGenerated = Array.isArray(raw) ? true : (raw?.generated ?? true)

    const sections = titles.map((title, i) => {
      const t = typeof title === 'string' ? title : (title?.title || String(title))
      const sId = uuid()
      db.prepare('INSERT OR REPLACE INTO book_sections (id, chapter_id, number, title, generated) VALUES (?, ?, ?, ?, ?)').run(sId, chId, i + 1, t, isGenerated ? 1 : 0)
      return { id: sId, number: i + 1, title: t, generated: isGenerated }
    })

    return { id: chId, number: ch.number, title: ch.title, sections }
  })

  // Fallback: fill any chapters that got no sections (truncated response)
  const missing = chapters.filter(ch => ch.sections.length === 0)
  if (missing.length > 0) {
    const missingList = missing.map(ch => `${ch.number}:${ch.title}`).join('\n')
    const { text: fbText } = await llm.create({
      system: 'You are a book expert. Respond only with valid JSON.',
      messages: [{
        role: 'user',
        content: `Book: "${book.title}" by ${book.author}.\nInvent 3-4 plausible section titles for each chapter.\nChapters:\n${missingList}\nJSON only: {"<number>":["s1","s2","s3"],...}`
      }],
      maxTokens: 1000,
      temperature: 0.5
    })
    let fb = {}
    try { fb = parseJSON(fbText); if (Array.isArray(fb)) fb = {} } catch { fb = {} }
    for (const ch of missing) {
      const secs = fb[String(ch.number)] || []
      ch.sections = secs.map((title, i) => {
        const t = typeof title === 'string' ? title : String(title)
        const sId = uuid()
        db.prepare('INSERT OR REPLACE INTO book_sections (id, chapter_id, number, title, generated) VALUES (?, ?, ?, ?, 1)').run(sId, ch.id, i + 1, t)
        return { id: sId, number: i + 1, title: t, generated: true }
      })
    }
  }

  res.json({ book, chapters, usable: true })
})

app.post('/book/:id/build-tree', async (req, res) => {
  // chapters: [{title, sections: [{title, generated}]}], withSections: bool
  const { chapters, parentId, sessionId, withSections, sectionsAsCategories } = req.body
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id)
  if (!book) return res.status(404).json({ error: 'Book not found' })

  const bookRoot = findOrCreateCategory({ title: book.title, parentId: parentId || null })

  for (const ch of (chapters || [])) {
    if (!ch?.title) continue
    const chapterCat = findOrCreateCategory({ title: ch.title, parentId: bookRoot.id })

    if (withSections && ch.sections?.length) {
      for (const s of ch.sections) {
        if (sectionsAsCategories) {
          const sectionCat = findOrCreateCategory({ title: s.title, parentId: chapterCat.id })
          createTopic({
            type: 'conversation',
            title: `Introduction — ${s.title}`,
            parentId: sectionCat.id,
            status: 'grey',
            sessionId: sessionId || null,
            bookId: book.id
          })
        } else {
          createTopic({
            type: 'conversation',
            title: s.title,
            parentId: chapterCat.id,
            status: 'grey',
            sessionId: sessionId || null,
            bookId: book.id
          })
        }
      }
    } else {
      createTopic({
        type: 'conversation',
        title: `Introduction — ${ch.title}`,
        parentId: chapterCat.id,
        status: 'grey',
        sessionId: sessionId || null,
        bookId: book.id
      })
    }
  }

  res.json({ tree: getTree() })
})

// ── Token usage ───────────────────────────────────────────────────────────────

app.get('/usage', (req, res) => {
  const { sessionId } = req.query

  const session = sessionId
    ? db.prepare('SELECT SUM(input_tokens) as i, SUM(output_tokens) as o FROM usage WHERE session_id = ?').get(sessionId)
    : { i: 0, o: 0 }

  const allTime = db.prepare('SELECT SUM(input_tokens) as i, SUM(output_tokens) as o FROM usage').get()

  res.json({
    session: { inputTokens: session?.i || 0, outputTokens: session?.o || 0 },
    allTime: { inputTokens: allTime?.i || 0, outputTokens: allTime?.o || 0 }
  })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Little Professor backend running on port ${PORT}`))
