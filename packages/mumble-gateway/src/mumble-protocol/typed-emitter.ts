type Listener<T> = (payload: T) => void

export class TypedEmitter<Events extends Record<string, unknown>> {
  private _listeners = new Map<keyof Events, Set<Listener<any>>>()

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this._listeners.get(event)
    if (!set) {
      set = new Set()
      this._listeners.set(event, set)
    }
    set.add(listener as Listener<any>)
    return () => this.off(event, listener)
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const set = this._listeners.get(event)
    if (!set) return
    set.delete(listener as Listener<any>)
    if (set.size === 0) this._listeners.delete(event)
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this._listeners.get(event)
    if (!set) return
    for (const listener of set) {
      try {
        listener(payload)
      } catch {
        // ignore
      }
    }
  }
}

