import { useState, useEffect } from 'react'
import { api } from '../../api/client.js'
import { BookPicker } from '../BookPicker/BookPicker.jsx'
import './SuggestionsPopup.css'

export function SuggestionsPopup({ context, sessionId, onConfirm, onClose }) {
  // context=null → global (ask subject, generate chapters)
  // context={ rootSubject } only → root category + (generate chapters for that subject)
  // context={ id, title, rootSubject } → chapter + (generate sections for that chapter)
  const isSection = !!(context?.id)
  const initialSubject = context?.rootSubject || context?.title || ''

  const [subject, setSubject] = useState(initialSubject)
  const [suggestions, setSuggestions] = useState([])
  const [isChapterMode, setIsChapterMode] = useState(false)
  const [checked, setChecked] = useState({})
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [ignoreTree, setIgnoreTree] = useState(false)
  const [showBooks, setShowBooks] = useState(false)

  useEffect(() => {
    if (initialSubject) fetchSuggestions(initialSubject)
  }, [])

  async function fetchSuggestions(s) {
    if (!s.trim()) return
    setLoading(true)
    try {
      const parentId = isSection ? context.id : null
      const parentTitle = isSection ? context.title : null
      const { suggestions: list, isChapter } = await api.getSuggestions(s, ignoreTree, parentId, parentTitle)
      setSuggestions(list)
      setIsChapterMode(!!isChapter)
      const init = {}
      list.forEach((_, i) => { init[i] = true })
      setChecked(init)
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleSubjectKey(e) {
    if (e.key === 'Enter') fetchSuggestions(subject)
  }

  function toggle(i) {
    setChecked(c => ({ ...c, [i]: !c[i] }))
  }

  async function handleConfirm() {
    const selected = suggestions.filter((_, i) => checked[i])
    if (!selected.length) return
    setConfirming(true)
    await onConfirm(selected, subject, isChapterMode)
    setConfirming(false)
  }

  if (showBooks) {
    return (
      <BookPicker
        subject={subject}
        context={context}
        sessionId={sessionId}
        onTreeBuilt={(tree) => { onConfirm(null, null, null, tree) }}
        onClose={() => setShowBooks(false)}
      />
    )
  }

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          {isSection
            ? <span className="popup-section-label">Sections — <em>{context.title}</em></span>
            : <input
                className="popup-subject"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                onKeyDown={handleSubjectKey}
                placeholder="What do you want to learn?"
                autoFocus
              />
          }
          <button className="popup-close" onClick={onClose}>✕</button>
        </div>

        {loading && <div className="popup-loading">Generating {isSection ? 'sections' : 'chapters'}...</div>}

        {!loading && suggestions.length > 0 && (
          <div className="popup-suggestions">
            {!isSection && (
              <div className="popup-mode-hint">Chapters — each will contain an intro topic</div>
            )}
            {suggestions.map((s, i) => (
              <label key={i} className="popup-suggestion">
                <input
                  type="checkbox"
                  checked={!!checked[i]}
                  onChange={() => toggle(i)}
                />
                <span>{s}</span>
              </label>
            ))}
          </div>
        )}

        <div className="popup-footer">
          <div style={{display:'flex', flexDirection:'column', gap:4, flex:1}}>
            <label className="popup-ignore-tree">
              <input type="checkbox" checked={ignoreTree} onChange={e => setIgnoreTree(e.target.checked)} />
              Ignore tree
            </label>
            {!isSection && (
              <label className="popup-ignore-tree">
                <input type="checkbox" checked={showBooks} onChange={e => { if (e.target.checked && subject) setShowBooks(true) }} disabled={!subject} />
                Books
              </label>
            )}
          </div>
          <button
            className="popup-more"
            onClick={() => fetchSuggestions(subject)}
            disabled={loading || !subject}
          >
            Suggestions
          </button>
          <button
            className="popup-confirm"
            onClick={handleConfirm}
            disabled={confirming || !Object.values(checked).some(Boolean)}
          >
            {confirming ? 'Adding...' : 'Add to tree'}
          </button>
        </div>
      </div>
    </div>
  )
}
