import { useEffect } from 'react'

export interface ShortcutDefinition {
  key: string
  ctrlOrMeta?: boolean
  shift?: boolean
  alt?: boolean
  handler: (event: KeyboardEvent) => void
}

function matches(definition: ShortcutDefinition, event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== definition.key.toLowerCase()) {
    return false
  }

  if (Boolean(definition.ctrlOrMeta) !== Boolean(event.ctrlKey || event.metaKey)) {
    return false
  }

  if (Boolean(definition.shift) !== Boolean(event.shiftKey)) {
    return false
  }

  if (Boolean(definition.alt) !== Boolean(event.altKey)) {
    return false
  }

  return true
}

export function registerShortcuts(definitions: ShortcutDefinition[]): () => void {
  const listener = (event: KeyboardEvent) => {
    const activeElement = document.activeElement
    const isTypingTarget =
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement

    for (const definition of definitions) {
      if (!matches(definition, event)) {
        continue
      }

      if (isTypingTarget && definition.key.toLowerCase() === 'n' && !definition.ctrlOrMeta) {
        continue
      }

      event.preventDefault()
      definition.handler(event)
      return
    }
  }

  window.addEventListener('keydown', listener)
  return () => window.removeEventListener('keydown', listener)
}

export function useShortcuts(definitions: ShortcutDefinition[]): void {
  useEffect(() => registerShortcuts(definitions), [definitions])
}
