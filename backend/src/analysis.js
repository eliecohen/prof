import db from './db.js'
import { findOrCreateCategory, createTopic } from './tree.js'

// Fire-and-forget — called after every exchange, never blocks the Prof response

export async function runParallelAnalysis({ llmClient, topicId, topicTitle, messages, sessionId }) {
  // Run both in parallel, errors are silent
  await Promise.allSettled([
    updateEnrichedProfile({ llmClient, messages }),
    detectSubjectDrift({ llmClient, topicId, topicTitle, messages, sessionId })
  ])
}

async function updateEnrichedProfile({ llmClient, messages }) {
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get()
  const lastExchanges = messages.slice(-4)

  if (lastExchanges.length < 2) return

  const exchangeText = lastExchanges
    .map(m => `${m.role === 'user' ? 'Learner' : 'Prof'}: ${m.content}`)
    .join('\n')

  const current = profile.enriched_profile || 'No analysis yet.'

  const { text } = await llmClient.create({
    system: 'You analyze learning interactions to build a profile of the learner. Be brief and precise.',
    messages: [{
      role: 'user',
      content: `Current profile:\n${current}\n\nNew exchange:\n${exchangeText}\n\nUpdate the profile in 3-5 sentences. Focus on: reasoning style, engagement signals, effective analogies, recurring tendencies. Return only the updated profile text, nothing else.`
    }],
    maxTokens: 300,
    temperature: 0.3
  })

  db.prepare('UPDATE profile SET enriched_profile = ? WHERE id = 1').run(text)
}

async function detectSubjectDrift({ llmClient, topicId, topicTitle, messages, sessionId }) {
  const lastMessage = messages.at(-1)
  if (!lastMessage || lastMessage.role !== 'user') return

  const { text } = await llmClient.create({
    system: 'You detect topic changes in learning conversations. Respond only with valid JSON.',
    messages: [{
      role: 'user',
      content: `Current topic: "${topicTitle}"\nLast user message: "${lastMessage.content}"\n\nHas the subject clearly changed to a different topic? Respond with JSON only:\n{"drifted": boolean, "new_subject": "string or empty"}`
    }],
    maxTokens: 100,
    temperature: 0
  })

  let result
  try {
    result = JSON.parse(text.trim())
  } catch {
    return
  }

  if (!result.drifted || !result.new_subject) return

  // Create new black node for the drifted subject
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get()
  const depth = profile.tree_depth || 2

  const categories = await extractCategories({ llmClient, subject: result.new_subject, depth })

  let parentId = null
  for (const catTitle of categories) {
    const cat = findOrCreateCategory({ title: catTitle, parentId })
    parentId = cat.id
  }

  createTopic({
    type: 'conversation',
    title: result.new_subject,
    parentId,
    status: 'visited',
    sessionId
  })
}

export async function extractCategories({ llmClient, subject, depth }) {
  const { text } = await llmClient.create({
    system: 'You organize learning topics into categories. Respond only with valid JSON.',
    messages: [{
      role: 'user',
      content: `Topic: "${subject}"\nGenerate exactly ${depth} parent category name(s) for this topic, from most general to most specific.\nRules: max 2 words per category, no "&", no "and", keep it short.\nExamples: "LLM", "Training", "Biology", "Quantum Physics"\nRespond with JSON array only: ["Category1"${depth > 1 ? ', "Category2"' : ''}]`
    }],
    maxTokens: 100,
    temperature: 0
  })

  try {
    const cats = JSON.parse(text.trim())
    return Array.isArray(cats) ? cats.slice(0, depth) : []
  } catch {
    return []
  }
}
