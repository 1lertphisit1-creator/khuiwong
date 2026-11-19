import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { BbcodeBody } from '@/components/forum/parts.tsx'

const TOOLS = [
  ['b', 'b'],
  ['i', 'i'],
  ['u', 'u'],
  ['quote', 'quote'],
  ['code', 'code'],
  ['url', 'url'],
  ['img', 'img'],
] as const

export type ComposerHandle = {
  insert: (text: string) => void
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    mode: 'topic' | 'reply'
    guest: boolean
    busy: boolean
    error: string | null
    onSubmit: (value: { subject?: string; body: string; guestName?: string }) => void
  }
>(function Composer({ mode, guest, busy, error, onSubmit }, ref) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [guestName, setGuestName] = useState('')
  const [preview, setPreview] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    insert(text: string) {
      setBody((current) => `${current}${current ? '\n\n' : ''}${text}`)
      setPreview(true)
      areaRef.current?.focus()
    },
  }))

  function wrap(tag: string) {
    const area = areaRef.current
    const value = body
    const start = area?.selectionStart ?? value.length
    const end = area?.selectionEnd ?? value.length
    const selected = value.slice(start, end)
    const open = `[${tag}]`
    const close = `[/${tag}]`
    const next = `${value.slice(0, start)}${open}${selected}${close}${value.slice(end)}`
    setBody(next)
    requestAnimationFrame(() => {
      const field = areaRef.current
      if (!field) return
      field.focus()
      const cursor = start + open.length
      field.setSelectionRange(cursor, cursor + selected.length)
    })
  }

  return (
    <form
      id={mode === 'topic' ? 'new-topic-form' : 'reply-form'}
      className="smf-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({
          subject: mode === 'topic' ? subject : undefined,
          body,
          guestName: guest ? guestName : undefined,
        })
      }}
    >
      <div className="smf-cat">{mode === 'topic' ? 'New Topic' : 'Reply'}</div>
      <div className="smf-form-body">
        {guest ? (
          <label className="smf-field">
            <span>Name</span>
            <input
              className="smf-input"
              value={guestName}
              maxLength={24}
              aria-label="ชื่อผู้มาเยือน"
              data-testid="guest-name"
              onChange={(event) => setGuestName(event.target.value)}
            />
          </label>
        ) : null}
        {mode === 'topic' ? (
          <label className="smf-field">
            <span>Subject</span>
            <input
              className="smf-input"
              value={subject}
              maxLength={80}
              aria-label="หัวข้อ"
              data-testid="new-topic-subject"
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>
        ) : null}
        <label className="smf-field">
          <span>Message</span>
          <div className="smf-toolbar" role="toolbar" aria-label="BBCode">
            {TOOLS.map(([tag, label]) => (
              <button key={tag} type="button" className="smf-tool" onClick={() => wrap(tag)}>
                {label}
              </button>
            ))}
          </div>
          <textarea
            ref={areaRef}
            className="smf-area"
            value={body}
            aria-label={mode === 'topic' ? 'เนื้อหากระทู้' : 'ข้อความตอบ'}
            data-testid={mode === 'topic' ? 'new-topic-body' : 'reply-body'}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        {preview ? (
          <div data-testid="bbcode-preview" className="smf-preview">
            <div className="smf-small">Preview</div>
            <BbcodeBody className="smf-post-text" text={body || ' '} />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="smf-error">
            {error}
          </p>
        ) : null}
        <div className="smf-form-actions">
          <button type="submit" className="smf-button" disabled={busy} data-testid={mode === 'topic' ? 'new-topic-submit' : 'reply-submit'}>
            {busy ? 'Posting…' : 'Post'}
          </button>
          <button type="button" className="smf-button smf-button-alt" data-testid="preview-toggle" onClick={() => setPreview((value) => !value)}>
            Preview
          </button>
        </div>
      </div>
    </form>
  )
})
