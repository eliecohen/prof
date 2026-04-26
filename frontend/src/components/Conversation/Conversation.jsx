import { useEffect, useRef } from 'react'
import './Conversation.css'

function renderInline(text) {
  // Split on **bold** and *italic* markers, render as React elements
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

export function Conversation({ messages, topic, breadcrumb, profile, isLoading, onSend, onParagraphClick, threadedParagraphs }) {
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!isLoading) inputRef.current?.focus()
  }, [isLoading, topic])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const val = inputRef.current.value.trim()
      if (val) {
        onSend(val)
        inputRef.current.value = ''
      }
    }
  }

  const firstName = profile?.first_name || 'You'

  return (
    <div className="conversation">
      {breadcrumb.length > 0 && (
        <div className="breadcrumb">
          {breadcrumb.map((b, i) => (
            <span key={b.id}>
              {i > 0 && <span className="breadcrumb-sep"> › </span>}
              <span className={b.type === 'conversation' ? 'breadcrumb-active' : ''}>{b.title}</span>
            </span>
          ))}
        </div>
      )}

      <div className="messages">
        {messages.length === 0 && topic && (
          <div className="empty-state">
            {isLoading ? 'Prof is thinking...' : ''}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message message-${msg.role}`}>
            <span className="message-name">
              {msg.role === 'user' ? `${firstName}:` : 'Prof:'}
            </span>
            {msg.role === 'assistant' ? (
              <div className="message-content">
                {msg.content.split('\n\n').map((para, i) => {
                  const hasThread = threadedParagraphs?.has(`${msg.id}-${i}`)
                  return (
                    <p
                      key={i}
                      className={`paragraph ${hasThread ? 'has-thread' : ''}`}
                      onClick={() => onParagraphClick(msg, para, i)}
                    >
                      {renderInline(para)}
                    </p>
                  )
                })}
              </div>
            ) : (
              <span className="message-content">{msg.content}</span>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="message message-assistant">
            <span className="message-name">Prof:</span>
            <span className="message-content typing">...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="input-area">
        <textarea
          ref={inputRef}
          placeholder="Ask anything"
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={!topic || isLoading}
        />
      </div>
    </div>
  )
}
