import { useState } from 'react'
import { api } from '../../api/client.js'
import './BookPicker.css'

export function BookPicker({ subject, context, sessionId, onTreeBuilt, onClose }) {
  const [books, setBooks] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)
  const [toc, setToc] = useState(null)
  const [tocLoading, setTocLoading] = useState(false)
  const [checkedChapters, setCheckedChapters] = useState({})
  const [withSections, setWithSections] = useState(true)
  const [sectionsAsCategories, setSectionsAsCategories] = useState(false)
  const [building, setBuilding] = useState(false)

  async function searchBooks() {
    setLoading(true)
    try {
      const results = await api.searchBooks(subject)
      setBooks(results)
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const exclude = (books || []).map(b => b.title)
      const more = await api.searchBooks(subject, exclude)
      setBooks(prev => [...prev, ...more])
    } finally {
      setLoadingMore(false)
    }
  }

  async function selectBook(book) {
    setSelectedBook(book)
    setTocLoading(true)
    setToc(null)
    setCheckedChapters({})
    try {
      const result = await api.getBookToc(book.id)
      setToc(result)
      if (result.usable) {
        const init = {}
        result.chapters.forEach(ch => { init[ch.id] = true })
        setCheckedChapters(init)
      }
    } finally {
      setTocLoading(false)
    }
  }

  function toggleChapter(id) {
    setCheckedChapters(c => ({ ...c, [id]: !c[id] }))
  }

  async function handleBuild() {
    const chapters = toc.chapters.filter(ch => checkedChapters[ch.id])
    if (!chapters.length) return
    setBuilding(true)
    try {
      const result = await api.buildBookTree(selectedBook.id, chapters, context?.id || null, sessionId, withSections, sectionsAsCategories)
      onTreeBuilt(result.tree)
    } finally {
      setBuilding(false)
    }
  }

  return (
    <div className="bookpicker-overlay" onClick={onClose}>
      <div className="bookpicker" onClick={e => e.stopPropagation()}>
        <div className="bookpicker-header">
          <span>Books — <em>{subject}</em></span>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="bookpicker-body">
          {!books && !loading && (
            <div className="bookpicker-search">
              <button className="bookpicker-btn primary" onClick={searchBooks}>
                Search books on "{subject}"
              </button>
            </div>
          )}

          {loading && <div className="bookpicker-status">Searching books...</div>}

          {books && !selectedBook && (
            <div className="bookpicker-list">
              {books.length === 0
                ? <div className="bookpicker-status">No books found.</div>
                : books.map(b => (
                  <div key={b.id} className="bookpicker-book" onClick={() => selectBook(b)}>
                    <div className="book-title">{b.title}</div>
                    <div className="book-meta">{b.author} · {b.year}</div>
                  </div>
                ))
              }
              {books.length > 0 && (
                <button className="bookpicker-btn more-btn" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading...' : 'More books'}
                </button>
              )}
            </div>
          )}

          {selectedBook && (
            <div className="bookpicker-toc">
              <div className="bookpicker-back" onClick={() => { setSelectedBook(null); setToc(null) }}>← Back</div>
              <div className="book-selected-title">{selectedBook.title}</div>

              {tocLoading && <div className="bookpicker-status">Loading table of contents...</div>}

              {toc && !toc.usable && (
                <div className="bookpicker-status error">
                  Real chapters not available for this book — cannot be used.
                </div>
              )}

              {toc && toc.usable && (
                <>
                  <div className="toc-options">
                    <label className="toc-option-label">
                      <input type="checkbox" checked={withSections} onChange={e => { setWithSections(e.target.checked); if (!e.target.checked) setSectionsAsCategories(false) }} />
                      Include sections
                    </label>
                    {withSections && (
                      <label className="toc-option-label">
                        <input type="checkbox" checked={sectionsAsCategories} onChange={e => setSectionsAsCategories(e.target.checked)} />
                        Sections as categories
                      </label>
                    )}
                  </div>
                  <div className="toc-list">
                    {toc.chapters.map(ch => (
                      <div key={ch.id} className="toc-chapter">
                        <label className="toc-chapter-label">
                          <input type="checkbox" checked={!!checkedChapters[ch.id]} onChange={() => toggleChapter(ch.id)} />
                          <span>Ch. {ch.number} — {ch.title}</span>
                        </label>
                        {withSections && ch.sections?.length > 0 && (
                          <div className="toc-sections">
                            {ch.sections.map((s, i) => (
                              <div key={s.id || i} className={`toc-section ${s.generated ? 'generated' : ''}`}>
                                {s.number}. {s.title}
                                {s.generated && <span className="generated-badge">generated</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    className="bookpicker-btn primary"
                    onClick={handleBuild}
                    disabled={building || !Object.values(checkedChapters).some(Boolean)}
                  >
                    {building ? 'Building tree...' : 'Build tree'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
