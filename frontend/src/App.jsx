import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from './api/client.js'
import { Tree } from './components/Tree/Tree.jsx'
import { Conversation } from './components/Conversation/Conversation.jsx'
import { Thread } from './components/Thread/Thread.jsx'
import { SuggestionsPopup } from './components/SuggestionsPopup/SuggestionsPopup.jsx'
import { ProfilePanel } from './components/ProfilePanel/ProfilePanel.jsx'
import './App.css'

export default function App() {
  const [tree, setTree] = useState([])
  const [activeTopicId, setActiveTopicId] = useState(null)
  const [messages, setMessages] = useState([])
  const [breadcrumb, setBreadcrumb] = useState([])
  const [profile, setProfile] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [usage, setUsage] = useState(null)

  const [treePanelOpen, setTreePanelOpen] = useState(true)
  const [treeWidth, setTreeWidth] = useState(() => parseInt(localStorage.getItem('treeWidth') || '280'))
  const dragging = useRef(false)

  const onDividerMouseDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    const onMove = (e) => {
      if (!dragging.current) return
      const w = Math.min(Math.max(e.clientX, 150), 500)
      setTreeWidth(w)
      localStorage.setItem('treeWidth', w)
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])
  const [openThread, setOpenThread] = useState(null)
  const [threadMessages, setThreadMessages] = useState([])
  const [threadedParagraphs, setThreadedParagraphs] = useState(new Set())

  // undefined = closed, null = global, object = category context
  const [suggestionsContext, setSuggestionsContext] = useState(undefined)
  const [showProfile, setShowProfile] = useState(false)
  const [loadingConv, setLoadingConv] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)

  useEffect(() => {
    async function init() {
      const [p, s, t] = await Promise.all([
        api.getProfile(),
        api.startSession(),
        api.getTree()
      ])
      setProfile(p)
      setSessionId(s.id)
      setTree(t)
      const hasKey = p.provider === 'anthropic' ? p.anthropic_api_key : (p.openai_api_key || p.api_key)
      if (!p.first_name || !hasKey) setShowProfile(true)

      const lastTopicId = localStorage.getItem('lastTopicId')
      if (lastTopicId) {
        const flat = []
        const walk = nodes => nodes.forEach(n => { flat.push(n); walk(n.children || []) })
        walk(t)
        if (flat.find(n => n.id === lastTopicId)) {
          selectTopic(lastTopicId, s.id)
        }
      }
    }
    init().catch(console.error)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    const refresh = () => api.getUsage(sessionId).then(setUsage).catch(() => {})
    refresh()
    const interval = setInterval(refresh, 10000)
    return () => clearInterval(interval)
  }, [sessionId])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (showProfile) return setShowProfile(false)
        if (suggestionsContext !== undefined) return setSuggestionsContext(undefined)
        if (openThread) return setOpenThread(null)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setTreePanelOpen(o => !o)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        setSuggestionsContext(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showProfile, suggestionsContext, openThread])

  async function selectTopic(topicId, sid) {
    localStorage.setItem('lastTopicId', topicId)
    console.log('[selectTopic]', topicId, 'sessionId=', sessionId)
    setActiveTopicId(topicId)
    setOpenThread(null)

    const [msgs, crumb, threads] = await Promise.all([
      api.getMessages(topicId),
      api.getBreadcrumb(topicId),
      api.getThreads(topicId)
    ])
    console.log('[selectTopic] msgs=', msgs.length, 'hasUser=', msgs.some(m => m.role === 'user'))
    setMessages(msgs)
    setBreadcrumb(crumb)
    setThreadedParagraphs(new Set(threads.map(t => t.anchor_key).filter(Boolean)))

    setTree(await api.getTree())

    if (!msgs.some(m => m.role === 'user')) {
      await profStarts(topicId, sid || sessionId)
    }
  }

  async function profStarts(topicId, sid) {
    console.log('[profStarts]', topicId, 'sid=', sid, 'sessionId=', sessionId)
    setLoadingConv(true)
    try {
      const result = await api.sendMessage(topicId, null, sid || sessionId)
      console.log('[profStarts] result=', result)
      setMessages(await api.getMessages(topicId))
      setTree(result.tree)
    } catch (err) {
      console.error('[profStarts] error:', err)
    } finally {
      setLoadingConv(false)
    }
  }

  async function handleSend(content) {
    if (!activeTopicId || !content) return
    setOpenThread(null)
    setLoadingConv(true)
    setMessages(m => [...m, { id: 'tmp', role: 'user', content, created_at: new Date().toISOString() }])
    try {
      const result = await api.sendMessage(activeTopicId, content, sessionId)
      setMessages(await api.getMessages(activeTopicId))
      setTree(result.tree)
    } catch (e) {
      alert(e.message)
      setMessages(m => m.filter(msg => msg.id !== 'tmp'))
    } finally {
      setLoadingConv(false)
    }
  }

  async function handleParagraphClick(msg, para) {
    const threads = await api.getThreads(activeTopicId)
    const existing = threads.find(t => t.anchor_text === para)
    if (existing) {
      setOpenThread(existing)
      setThreadMessages(await api.getThreadMessages(existing.id))
    } else {
      const thread = await api.newThread(activeTopicId, para)
      setOpenThread(thread)
      setThreadMessages([])
    }
  }

  async function handleSendThread(content) {
    if (!openThread || !content) return
    setLoadingThread(true)
    try {
      await api.sendThreadMessage(openThread.id, content)
      setThreadMessages(await api.getThreadMessages(openThread.id))
    } catch (e) {
      alert(e.message)
    } finally {
      setLoadingThread(false)
    }
  }

  async function handleSuggestionsConfirm(titles, subject, isChapter, prebuiltTree) {
    setSuggestionsContext(undefined)
    if (prebuiltTree) {
      setTree(prebuiltTree)
      return
    }
    const parentId = suggestionsContext?.id || null
    setLoadingConv(true)
    try {
      for (const title of titles) {
        await api.newTopic(title, parentId, sessionId, subject, isChapter)
      }
      setTree(await api.getTree())
    } finally {
      setLoadingConv(false)
    }
  }

  async function handleDeleteTopic(id) {
    await api.deleteTopic(id)
    setTree(await api.getTree())
  }

  async function handleSaveProfile(data) {
    const updated = await api.updateProfile(data)
    setProfile(updated)
  }

  const sessionTokens = (usage?.session?.inputTokens || 0) + (usage?.session?.outputTokens || 0)

  return (
    <div className="app">
      <div className="titlebar">
        <div className="titlebar-left">
          <button className="icon-btn" onClick={() => setTreePanelOpen(o => !o)} title="Toggle tree (⌘B)">☰</button>
        </div>
        <div className="titlebar-title">My Little Professor</div>
        <div className="titlebar-right">
          {sessionTokens > 0 && <span className="token-counter">{sessionTokens.toLocaleString()} tokens</span>}
          <button className="icon-btn" onClick={() => api.getTree().then(setTree)} title="Refresh tree">↺</button>
          <button className="icon-btn" onClick={async () => {
            await api.clearTree()
            setTree([])
            setActiveTopicId(null)
            setMessages([])
            setBreadcrumb([])
          }} title="Effacer l'arbre (dev)">🗑</button>
          <button className="icon-btn" onClick={() => setShowProfile(true)} title="Profile" style={{fontSize: 22}}>⚙️</button>
        </div>
      </div>

      <div className="main" onClick={() => openThread && setOpenThread(null)}
        style={{
          '--tree-font-size': `${profile?.tree_font_size || 11}px`,
          '--conv-font-size': `${profile?.conv_font_size || 13}px`,
        }}
      >
        {treePanelOpen && (
          <>
            <div className="panel-tree" style={{ width: treeWidth }}>
              <Tree
                nodes={tree}
                activeTopicId={activeTopicId}
                onSelectTopic={node => selectTopic(node.id)}
                onDeleteTopic={handleDeleteTopic}
                onOpenSuggestions={ctx => setSuggestionsContext(ctx)}
              />
            </div>
            <div className="panel-divider" onMouseDown={onDividerMouseDown} />
          </>
        )}

        <div className="panel-conversation" onClick={e => e.stopPropagation()}>
          <Conversation
            messages={messages}
            topic={activeTopicId}
            breadcrumb={breadcrumb}
            profile={profile}
            isLoading={loadingConv}
            onSend={handleSend}
            onParagraphClick={handleParagraphClick}
            threadedParagraphs={threadedParagraphs}
          />
        </div>

        {openThread && (
          <div className="panel-thread" onClick={e => e.stopPropagation()}>
            <Thread
              thread={openThread}
              messages={threadMessages}
              isLoading={loadingThread}
              onSend={handleSendThread}
              onClose={() => setOpenThread(null)}
            />
          </div>
        )}
      </div>

      {suggestionsContext !== undefined && (
        <SuggestionsPopup
          context={suggestionsContext}
          sessionId={sessionId}
          onConfirm={handleSuggestionsConfirm}
          onClose={() => setSuggestionsContext(undefined)}
        />
      )}

      {showProfile && (
        <ProfilePanel
          profile={profile || {}}
          usage={usage}
          onSave={handleSaveProfile}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  )
}
