export type TextOffsets = { startOffset: number; endOffset: number }

export type HighlightRange = TextOffsets & {
  id: string
  color: string
}

export function getTextOffsets(root: HTMLElement, range: Range): TextOffsets | null {
  try {
    const startRange = document.createRange()
    startRange.selectNodeContents(root)
    startRange.setEnd(range.startContainer, range.startOffset)

    const endRange = document.createRange()
    endRange.selectNodeContents(root)
    endRange.setEnd(range.endContainer, range.endOffset)

    const startOffset = startRange.toString().length
    const endOffset = endRange.toString().length
    return endOffset > startOffset ? { startOffset, endOffset } : null
  } catch {
    return null
  }
}

export function getRangeAtOffsets(root: HTMLElement, startOffset: number, endOffset: number): Range | null {
  if (startOffset < 0 || endOffset <= startOffset) return null

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  let total = 0
  let startNode: Text | null = null
  let endNode: Text | null = null
  let startNodeOffset = 0
  let endNodeOffset = 0
  let lastNode: Text | null = null

  while (current) {
    const textNode = current as Text
    const length = textNode.data.length
    if (length) {
      lastNode = textNode
      if (!startNode && startOffset <= total + length) {
        startNode = textNode
        startNodeOffset = Math.max(0, startOffset - total)
      }
      if (!endNode && endOffset <= total + length) {
        endNode = textNode
        endNodeOffset = Math.max(0, endOffset - total)
        break
      }
      total += length
    }
    current = walker.nextNode()
  }

  if (!startNode || !lastNode) return null
  if (!endNode) {
    endNode = lastNode
    endNodeOffset = lastNode.data.length
  }

  try {
    const range = document.createRange()
    range.setStart(startNode, Math.min(startNodeOffset, startNode.data.length))
    range.setEnd(endNode, Math.min(endNodeOffset, endNode.data.length))
    return range.collapsed ? null : range
  } catch {
    return null
  }
}

export function applyHighlight(root: HTMLElement, highlight: HighlightRange) {
  if (root.querySelector(`[data-highlight-id="${CSS.escape(highlight.id)}"]`)) return

  const range = getRangeAtOffsets(root, highlight.startOffset, highlight.endOffset)
  if (!range) return

  const mark = document.createElement('mark')
  mark.dataset.highlightId = highlight.id
  mark.style.backgroundColor = highlight.color
  mark.style.borderRadius = '2px'
  mark.style.paddingInline = '0.08em'

  try {
    range.surroundContents(mark)
  } catch {
    mark.appendChild(range.extractContents())
    range.insertNode(mark)
  }
}

export function getHighlightIdsInRange(root: HTMLElement, range: Range) {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-highlight-id]'))
    .filter((mark) => {
      try {
        return range.intersectsNode(mark)
      } catch {
        return false
      }
    })
    .map((mark) => mark.dataset.highlightId)
    .filter((id): id is string => Boolean(id))
}

export function removeHighlight(root: HTMLElement | null, id: string) {
  const mark = root?.querySelector<HTMLElement>(`[data-highlight-id="${CSS.escape(id)}"]`)
  if (!mark?.parentNode) return

  const parent = mark.parentNode
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
  parent.removeChild(mark)
  parent.normalize()
}
