import DOMPurify from 'isomorphic-dompurify'

export function sanitizeHtml(value: string | null | undefined) {
  return DOMPurify.sanitize(value ?? '', {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['srcdoc'],
  })
}
