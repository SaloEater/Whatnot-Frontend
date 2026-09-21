'use client'

// Board-published named shapes a boxless overlay can target (board-anchors-plan.md). A board paints
// its content somewhere INSIDE its placement box — inset by a margin, centred, clipped to rounded
// corners — and a wrap animation that only knows `useResolvedBox` (resolvedBoxes.tsx) hugs the
// placement rectangle instead of the painted shape. Here a board PUBLISHES named shapes at runtime
// (`usePublishAnchors`) and an animation TARGETS one by name (`useResolvedAnchor`/`useTargetShape`),
// falling back to the plain box when the name is absent or the target publishes nothing.
//
// Modelled on resolvedBoxes.tsx, but a STORE rather than a static per-render map: a board's shape
// isn't known until ITS OWN render/layout has happened, so values are written by the publishing
// component rather than computed once by the page from `elementsForPhase()`. Anchor NAMES are
// declared statically in the registry (`RegistryEntry.anchors`, registry.ts) so the controls page's
// "Attach to" select can list them without the layout page (or this provider) running at all — only
// anchor VALUES require the layout page.

import { createContext, ReactNode, useCallback, useContext, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { useResolvedBox } from './resolvedBoxes'

/** A rounded rectangle in canvas coordinates. rx/ry = 0 for square corners. */
export type Shape = { x: number; y: number; w: number; h: number; rx: number; ry: number }

const KEY_SEP = '\u0000'

type Listener = () => void

// Map<"${elementKey}\u0000${anchor}", Shape> plus a listener set, held as one instance per
// <AnchorsProvider>. A small class rather than a handful of closures purely so the provider can
// hand out ONE stable instance (a lazy useState initializer) without re-deriving its methods.
class AnchorStore {
    private shapes = new Map<string, Shape>()
    private listeners = new Set<Listener>()

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    get = (mapKey: string): Shape | undefined => {
        return this.shapes.get(mapKey)
    }

    private notify() {
        this.listeners.forEach((listener) => listener())
    }

    /**
     * Full replace-set for `elementKey`: every anchor in `next` is written, but ONLY when it
     * actually differs value-wise from what's stored — the existing Shape object is kept untouched
     * otherwise, which is what keeps `useResolvedAnchor`'s snapshot referentially stable across a
     * render that changed nothing (so a memo keyed on the returned Shape doesn't churn on, e.g., the
     * 60s config reconcile poll — the same identity trap `ring/`'s box memo works around). Any of
     * this key's previously-published anchors that are NOT in `next` are removed (a board that drops
     * to zero rows and publishes `{}` clears whatever it had published before).
     */
    publish = (elementKey: string, next: Record<string, Shape>): void => {
        const prefix = `${elementKey}${KEY_SEP}`
        let changed = false
        const seen = new Set<string>()

        for (const [anchor, shape] of Object.entries(next)) {
            const mapKey = `${prefix}${anchor}`
            seen.add(mapKey)
            const existing = this.shapes.get(mapKey)
            if (
                !existing ||
                existing.x !== shape.x ||
                existing.y !== shape.y ||
                existing.w !== shape.w ||
                existing.h !== shape.h ||
                existing.rx !== shape.rx ||
                existing.ry !== shape.ry
            ) {
                this.shapes.set(mapKey, { ...shape })
                changed = true
            }
        }

        // Array.from, not a direct `for...of` over the Map iterator: the project's tsconfig has no
        // `downlevelIteration`/es2015+ target, so a Map/Set iterator can't be looped directly (only
        // arrays can).
        for (const mapKey of Array.from(this.shapes.keys())) {
            if (mapKey.startsWith(prefix) && !seen.has(mapKey)) {
                this.shapes.delete(mapKey)
                changed = true
            }
        }

        if (changed) this.notify()
    }

    /** Unmount cleanup: every anchor this key ever published, gone in one pass. */
    remove = (elementKey: string): void => {
        const prefix = `${elementKey}${KEY_SEP}`
        let changed = false
        for (const mapKey of Array.from(this.shapes.keys())) {
            if (mapKey.startsWith(prefix)) {
                this.shapes.delete(mapKey)
                changed = true
            }
        }
        if (changed) this.notify()
    }
}

const AnchorsContext = createContext<AnchorStore | null>(null)

export function AnchorsProvider({ children }: { children: ReactNode }): JSX.Element {
    // Lazy initializer: one AnchorStore instance for the lifetime of this provider.
    const [store] = useState(() => new AnchorStore())
    return <AnchorsContext.Provider value={store}>{children}</AnchorsContext.Provider>
}

/**
 * Boards call this with every anchor they expose, in canvas coordinates. Safe outside the provider
 * (no-op) — the controls page never mounts <AnchorsProvider>, and this component is never rendered
 * there either, but the guard is what makes that a non-requirement rather than an invariant to keep.
 */
export function usePublishAnchors(elementKey: string, shapes: Record<string, Shape>): void {
    const store = useContext(AnchorsContext)

    // Runs after every render, deliberately with NO dependency array: `shapes` is a fresh object
    // literal from the caller's render (e.g. `geometry ? {field: ..., grid: ...} : {}`), and
    // `AnchorStore.publish`'s own value-wise compare (above) is what keeps this cheap and avoids
    // notifying subscribers when nothing actually changed.
    useLayoutEffect(() => {
        store?.publish(elementKey, shapes)
    })

    // A SEPARATE effect, keyed only on `elementKey`, so the cleanup — which removes every anchor
    // this key has ever published — fires on unmount (or a rare `elementKey` change), never on the
    // ordinary re-publish above.
    useLayoutEffect(() => {
        return () => {
            store?.remove(elementKey)
        }
    }, [store, elementKey])
}

/**
 * Boxless elements call this. `undefined` when there's no provider, the target hasn't published
 * that name, or `anchor` itself is undefined — callers fall back to `useResolvedBox`
 * (see `useTargetShape` below for the combined convenience).
 */
export function useResolvedAnchor(elementKey: string, anchor: string | undefined): Shape | undefined {
    const store = useContext(AnchorsContext)
    const mapKey = anchor !== undefined ? `${elementKey}${KEY_SEP}${anchor}` : null

    const subscribe = useCallback(
        (listener: () => void) => {
            if (!store) return () => {}
            return store.subscribe(listener)
        },
        [store]
    )
    const getSnapshot = useCallback((): Shape | undefined => {
        if (!store || mapKey === null) return undefined
        return store.get(mapKey)
    }, [store, mapKey])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Convenience for the common case: the anchor if the target publishes it, else the target's plain
 * box promoted to a Shape (rx = ry = 0), else undefined (the target is unmounted, unplaced this
 * stage, or there's no provider at all).
 */
export function useTargetShape(elementKey: string, anchor: string | undefined): Shape | undefined {
    const anchorShape = useResolvedAnchor(elementKey, anchor)
    const box = useResolvedBox(elementKey)
    if (anchorShape) return anchorShape
    return box ? { x: box.x, y: box.y, w: box.w, h: box.h, rx: 0, ry: 0 } : undefined
}
