import { useState, useEffect } from 'react'
import './Tree.css'

export function Tree({ nodes, activeTopicId, onSelectTopic, onDeleteTopic, onOpenSuggestions }) {
  const [expandAll, setExpandAll] = useState(null) // null=natural, true=expand, false=collapse

  return (
    <div className="tree">
      <div className="tree-header">
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="tree-add-btn" onClick={() => onOpenSuggestions(null)} title="Add topics">+</button>
          <button className="tree-add-btn" onClick={() => setExpandAll(true)} title="Expand all">▼</button>
          <button className="tree-add-btn" onClick={() => setExpandAll(false)} title="Collapse all">▶</button>
        </div>
      </div>
      <div className="tree-nodes">
        {nodes.map(node => (
          <TreeNode
            key={node.id}
            node={node}
            activeTopicId={activeTopicId}
            onSelectTopic={onSelectTopic}
            onDeleteTopic={onDeleteTopic}
            onOpenSuggestions={onOpenSuggestions}
            expandAll={expandAll}
            depth={0}
            rootSubject={node.title}
          />
        ))}
      </div>
    </div>
  )
}

function TreeNode({ node, activeTopicId, onSelectTopic, onDeleteTopic, onOpenSuggestions, expandAll, depth, rootSubject }) {
  const isActive = node.id === activeTopicId
  const isAncestor = hasActiveDescendant(node, activeTopicId)
  const [open, setOpen] = useState(isActive || isAncestor)

  const hasChildren = node.children?.length > 0

  useEffect(() => {
    if (expandAll === true) setOpen(true)
    if (expandAll === false) setOpen(isActive || isAncestor)
  }, [expandAll])

  if (node.type === 'category') {
    // root category (depth=0): + opens chapter suggestions
    // chapter category (depth>0): + opens section suggestions for that chapter
    const isRoot = depth === 0
    const suggCtx = isRoot
      ? null  // will show subject input, trigger chapter mode
      : { ...node, rootSubject: rootSubject || node.title }

    return (
      <div className="tree-category" style={{ paddingLeft: depth * 12 }}>
        <div className="tree-category-row">
          <span className="tree-toggle" onClick={() => setOpen(o => !o)}>
            {hasChildren ? (open ? '▾' : '▸') : '·'}
          </span>
          <span className="tree-category-title">{node.title}</span>
          <button
            className="tree-add-btn small"
            onClick={() => onOpenSuggestions(isRoot ? { rootSubject: node.title } : suggCtx)}
            title={isRoot ? 'Add chapters' : 'Add sections'}
          >+</button>
          <button
            className="tree-add-btn small tree-del-btn"
            onClick={() => onDeleteTopic(node.id)}
            title="Delete"
          >−</button>
        </div>
        {open && hasChildren && (
          <div className="tree-children">
            {node.children.map(child => (
              <TreeNode
                key={child.id}
                node={child}
                activeTopicId={activeTopicId}
                onSelectTopic={onSelectTopic}
                onDeleteTopic={onDeleteTopic}
                onOpenSuggestions={onOpenSuggestions}
                expandAll={expandAll}
                depth={depth + 1}
                rootSubject={rootSubject}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Conversation node
  return (
    <div
      className={`tree-conversation ${node.status} ${isActive ? 'active' : ''}`}
      style={{ paddingLeft: depth * 12 + 16 }}
      onClick={() => onSelectTopic(node)}
      onContextMenu={(e) => {
        e.preventDefault()
        if (node.status === 'grey') onDeleteTopic(node.id)
      }}
      title={node.status === 'grey' ? 'Right-click to remove' : ''}
    >
      {node.title}
    </div>
  )
}

function hasActiveDescendant(node, activeTopicId) {
  if (!node.children) return false
  return node.children.some(c => c.id === activeTopicId || hasActiveDescendant(c, activeTopicId))
}
