const listeners = new Set<() => void>()

export function notifyLocalMutation(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeToLocalMutations(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
