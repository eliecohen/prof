const BASE = 'http://localhost:3001'

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Session
  startSession: () => req('POST', '/session/start'),
  endSession: (id, lastActiveTopicId) => req('PATCH', `/session/${id}/end`, { lastActiveTopicId }),

  // Profile
  getProfile: () => req('GET', '/profile'),
  updateProfile: (data) => req('PATCH', '/profile', data),

  // Tree
  getTree: () => req('GET', '/tree'),
  newTopic: (title, parentId, sessionId, subject, isChapter) => req('POST', '/topic/new', { title, parentId, sessionId, subject, isChapter }),
  updateTopicStatus: (id, status) => req('PATCH', `/topic/${id}/status`, { status }),
  moveTopic: (id, newParentId) => req('PATCH', `/topic/${id}/move`, { newParentId }),
  deleteTopic: (id) => req('DELETE', `/topic/${id}`),
  clearTree: () => req('DELETE', '/tree'),
  getBreadcrumb: (id) => req('GET', `/topic/${id}/breadcrumb`),

  // Conversation
  sendMessage: (topicId, content, sessionId) => req('POST', `/topic/${topicId}/message`, { content, sessionId }),
  getMessages: (topicId) => req('GET', `/topic/${topicId}/messages`),

  // Threads
  newThread: (topicId, anchorText) => req('POST', '/thread/new', { topicId, anchorText }),
  sendThreadMessage: (threadId, content) => req('POST', `/thread/${threadId}/message`, { content }),
  getThreads: (topicId) => req('GET', `/topic/${topicId}/threads`),
  getThreadMessages: (threadId) => req('GET', `/thread/${threadId}/messages`),

  // Suggestions
  getSuggestions: (subject, ignoreTree, parentId, parentTitle) => req('POST', '/suggestions', { subject, ignoreTree, parentId, parentTitle }),

  // Books
  searchBooks: (q, exclude) => req('GET', `/books?q=${encodeURIComponent(q)}${exclude?.length ? `&exclude=${encodeURIComponent(exclude.join('|'))}` : ''}`),
  getBookToc: (id) => req('GET', `/book/${id}/toc`),
  buildBookTree: (id, chapters, parentId, sessionId, withSections, sectionsAsCategories) => req('POST', `/book/${id}/build-tree`, { chapters, parentId, sessionId, withSections, sectionsAsCategories }),

  // Usage
  getUsage: (sessionId) => req('GET', `/usage${sessionId ? `?sessionId=${sessionId}` : ''}`)
}
