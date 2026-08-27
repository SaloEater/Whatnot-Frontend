'use client'

// Remembers which element blocks the operator has folded, per channel AND per stage — folding a
// block on `selling` says nothing about whether the same element should be folded on `results`,
// so the stage is part of the key.
//
// Stored under one key per channel as a map of "<phase>:<elementKey>" -> true. Only FOLDED blocks
// are recorded; anything absent is open. That way the stored object stays small, and an element
// that is added later (or renamed) simply defaults to open instead of inheriting a stale entry.

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
    elementKey: string
): readonly [boolean, (next: boolean) => void] {
    const id = `${phase}:${elementKey}`
    const [open, setOpenState] = useState(true)

    // Restored after mount, not in the useState initialiser: localStorage does not exist during
    // SSR, and reading it during render would make the server and client markup disagree.
    useEffect(() => {
        setOpenState(!readAll(channelId)[id])
    }, [channelId, id])

    const setOpen = useCallback(
        (next: boolean) => {
            setOpenState(next)
            try {
                const all = readAll(channelId)
                if (next) delete all[id]
                else all[id] = true
                localStorage.setItem(storageKey(channelId), JSON.stringify(all))
            } catch {
                // Storage unavailable — the block still folds for this session.
            }
        },
        [channelId, id]
    )

    return [open, setOpen] as const
}
