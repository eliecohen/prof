import { useState } from 'react'
import './ProfilePanel.css'

export function ProfilePanel({ profile, usage, onSave, onClose }) {
  const [form, setForm] = useState({ ...profile })

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function handleSave() {
    onSave(form)
    onClose()
  }

  const sessionCost = estimateCost(usage?.session?.inputTokens, usage?.session?.outputTokens, form.model)
  const allTimeCost = estimateCost(usage?.allTime?.inputTokens, usage?.allTime?.outputTokens, form.model)

  return (
    <div className="profile-overlay">
      <div className="profile-panel">
        <div className="profile-header">
          <span>Profile</span>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="profile-body">
          <section>
            <h3>Identity</h3>
            <label>First name
              <input value={form.first_name || ''} onChange={e => set('first_name', e.target.value)} />
            </label>
            <label>Language
              <input list="languages" value={form.language || ''} onChange={e => set('language', e.target.value)} placeholder="french, english, hebrew..." />
              <datalist id="languages">
                <option value="french" />
                <option value="english" />
                <option value="hebrew" />
                <option value="spanish" />
                <option value="arabic" />
                <option value="german" />
                <option value="portuguese" />
              </datalist>
            </label>
            <label>Age
              <input type="number" value={form.age || ''} onChange={e => set('age', e.target.value)} />
            </label>
            <label>Level
              <select value={form.level || ''} onChange={e => set('level', e.target.value)}>
                <option value="">—</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label>Interests
              <input value={form.interests || ''} onChange={e => set('interests', e.target.value)} placeholder="biology, philosophy..." />
            </label>
          </section>

          <section>
            <h3>LLM</h3>
            <label>Provider
              <select value={form.provider || 'anthropic'} onChange={e => {
                const p = e.target.value
                setForm(f => ({
                  ...f,
                  provider: p,
                  model: p === 'anthropic' ? 'claude-sonnet-4-6' : f.model,
                  base_url: p === 'anthropic' ? 'https://api.anthropic.com' : f.base_url,
                }))
              }}>
                <option value="anthropic">Anthropic</option>
                <option value="openai-compatible">OpenAI-compatible (Ollama, etc.)</option>
              </select>
            </label>
            {form.provider !== 'anthropic' && (
              <label>Base URL
                <input value={form.base_url || ''} onChange={e => set('base_url', e.target.value)} placeholder="http://127.0.0.1:1234" />
              </label>
            )}
            <label>Model
              <input value={form.model || ''} onChange={e => set('model', e.target.value)} placeholder="claude-sonnet-4-6" />
            </label>
            {form.provider === 'anthropic' ? (
              <label>Anthropic API Key
                <input type="password" value={form.anthropic_api_key || ''} onChange={e => set('anthropic_api_key', e.target.value)} placeholder="sk-ant-..." />
              </label>
            ) : (
              <label>API Key (optional)
                <input type="password" value={form.openai_api_key || ''} onChange={e => set('openai_api_key', e.target.value)} placeholder="lm-studio" />
              </label>
            )}
            <label>Max tokens
              <input type="number" min="256" max="8192" step="256" value={form.max_tokens || 2048} onChange={e => set('max_tokens', parseInt(e.target.value))} />
            </label>
          </section>

          <section>
            <h3>Tree</h3>
            <label>Category depth
              <input type="number" min="1" max="5" value={form.tree_depth || 2} onChange={e => set('tree_depth', parseInt(e.target.value))} />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={!!form.auto_collapse} onChange={e => set('auto_collapse', e.target.checked ? 1 : 0)} />
              Auto-collapse unrelated branches
            </label>
            <label>Tree font size — {form.tree_font_size || 11}px
              <input type="range" min="9" max="16" value={form.tree_font_size || 11} onChange={e => set('tree_font_size', parseInt(e.target.value))} />
            </label>
            <label>Conversation font size — {form.conv_font_size || 13}px
              <input type="range" min="11" max="20" value={form.conv_font_size || 13} onChange={e => set('conv_font_size', parseInt(e.target.value))} />
            </label>
          </section>

          <section>
            <h3>Usage</h3>
            <div className="usage-row">
              <span>Session</span>
              <span>{usage?.session?.inputTokens + usage?.session?.outputTokens || 0} tokens · ~${sessionCost}</span>
            </div>
            <div className="usage-row">
              <span>All time</span>
              <span>{usage?.allTime?.inputTokens + usage?.allTime?.outputTokens || 0} tokens · ~${allTimeCost}</span>
            </div>
          </section>
        </div>

        <div className="profile-footer">
          <button className="profile-cancel" onClick={onClose}>Cancel</button>
          <button className="profile-save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

const PRICES = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
  'claude-opus-4-7': { input: 15, output: 75 },
}

function estimateCost(inputTokens = 0, outputTokens = 0, model = '') {
  const price = PRICES[model] || { input: 3, output: 15 }
  const cost = (inputTokens * price.input + outputTokens * price.output) / 1_000_000
  return cost.toFixed(4)
}
