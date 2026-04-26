import { useEffect, useRef } from 'react'
import './Thread.css'

export function Thread({ thread, messages, isLoading, onSend, onClose }) {
  const inputRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [thread])

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

  if (!thread) return null

  return (
    <div className="thread-panel">
      <div className="thread-header">
        <div className="thread-anchor">"{thread.anchor_text}"</div>
        <button className="thread-close" onClick={onClose}>✕</button>
      </div>

      <div className="thread-messages">
        {messages.length === 0 && (
          <div className="thread-prompt">What's not clear?</div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`thread-message thread-${msg.role}`}>
            <span className="thread-message-name">
              {msg.role === 'user' ? 'You:' : 'Prof:'}
            </span>
            <span className="thread-message-content">{msg.content}</span>
          </div>
        ))}
        {isLoading && (
          <div className="thread-message thread-assistant">
            <span className="thread-message-name">Prof:</span>
            <span className="thread-message-content typing">...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="thread-input">
        <textarea
          ref={inputRef}
          placeholder="What's not clear?"
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isLoading}
        />
      </div>
    </div>
  )
}
