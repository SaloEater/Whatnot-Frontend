'use client'

// Remembers which element blocks the operator has folded, per channel AND per stage — folding a
// block on `selling` says nothing about whether the same element should be folded on `results`,
// so the stage is part of the key.
//
// Stored under one key per channel as a map of "<phase>:<elementKey>[:<suffix>]" -> true. An entry
// records only that the section is in its NON-DEFAULT state; anything absent is at its default.
// That keeps the stored object small, lets an element added or renamed later fall back to the
// default instead of inheriting a stale entry, and means a section whose default is "collapsed"
// (the Box editor) stores the same shape as one whose default is "open" — no migration, and the
// entries written before `suffix`/`defaultOpen` existed still mean exactly what they used to.

import { useCallback, useEffect, useState } from 'react'

const storageKey = (channelId: number) => `obs-controls-${channelId}-folded`

function readAll(channelId: number): Record<string, true> {
    try {
        const raw = localStorage.getItem(storageKey(channelId))
        if (!raw) return {}
        const parsed: unknown = JSON.parse(raw)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, true>)
            : {}
    } catch {
        // Unparseable, or storage unavailable (private mode / disabled). Fold state is a
        // convenience — never let it break the controls page.
        return {}
    }
}

export function useFoldState(
    channelId: number,
    phase: string,
    elementKey: string,
    opts?: {
        /** Distinguishes sections within one element block (e.g. 'box'). Omit for the block itself. */
        suffix?: string
        /** Default when nothing is stored. Defaults to open. */
        defaultOpen?: boolean
    }
): readonly [boolean, (next: boolean) => void] {
    const defaultOpen = opts?.defaultOpen ?? true
    const id = opts?.suffix ? `${phase}:${elementKey}:${opts.suffix}` : `${phase}:${elementKey}`
    const [open, setOpenState] = useState(defaultOpen)

    // Restored after mount, not in the useState initialiser: localStorage does not exist during
    // SSR, and reading it during render would make the server and client markup disagree.
    useEffect(() => {
        // An entry means "not at the default", so its presence flips the default rather than
        // meaning "folded" outright.
        setOpenState(readAll(channelId)[id] ? !defaultOpen : defaultOpen)
    }, [channelId, id, defaultOpen])

    const setOpen = useCallback(
        (next: boolean) => {
            setOpenState(next)
            try {
                const all = readAll(channelId)
                if (next === defaultOpen) delete all[id]
                else all[id] = true
                localStorage.setItem(storageKey(channelId), JSON.stringify(all))
            } catch {
                // Storage unavailable — the block still folds for this session.
            }
        },
        [channelId, id, defaultOpen]
    )

    return [open, setOpen] as const
}
