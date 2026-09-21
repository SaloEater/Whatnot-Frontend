'use client'

// Per-team palette cache + hook for the board:sport_style layout element (sport-style-board-plan.md
// §4.3). Palette extraction (patchColors.ts's `extractPalette`) decodes a logo <img> onto a canvas
// — not free — so it runs at most once per team per page load. The cache is module-level (not React
// state), so it survives stage switches and element remounts; only a full page reload clears it.

import { useEffect, useState } from 'react'
import { extractPalette, PatchPalette } from './patchColors'
import { IsTeam } from '@/app/common/teams'

function teamSrc(team: string): string {
    return `/images/teams/${encodeURIComponent(team)}.webp`
}

/** Whether a spot name has real logo art (sport-style-board-plan.md R1 fix 4) — a real NFL team,
 *  or "Miscellaneous" (its own art via TeamIconSrc, counted as having an image). Anything else is
 *  a custom spot name with no logo, drawn as an initials label instead — see SportStyleBoard.tsx
 *  and `useTeamPalette` below, which must not attempt to load an image for one of these. */
export function hasLogo(team: string): boolean {
    return IsTeam(team) || team === 'Miscellaneous'
}

/** Loads and extracts one team's palette from its logo image — moved here from the team
 *  playground (setup/sport_style/team/page.tsx), which now imports this too. */
export function loadPalette(team: string): Promise<PatchPalette> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(extractPalette(img))
        img.onerror = reject
        img.src = teamSrc(team)
    })
}

// A promise while a load is in flight (so concurrent callers for the same team share one Image()
// load instead of racing separate ones), the resolved palette once it lands.
const cache = new Map<string, PatchPalette | Promise<PatchPalette>>()

/** The team's palette once loaded, or `null` before the first load resolves (or while a newly seen
 *  team's load is in flight) — the caller draws with its own fallback background in the meantime
 *  (sport-style-board-plan.md §4.3) and swaps in place once this hook's state updates, no layout
 *  shift since cell size is geometry-driven, not palette-driven.
 *
 *  R1 fix 4: a spot name with no real logo art (`!hasLogo`) must not try to load an image at all —
 *  this returns `null` immediately and the caller falls back to its own background/stitch, same as
 *  a still-loading team. */
export function useTeamPalette(team: string): PatchPalette | null {
    const eligible = hasLogo(team)
    const [palette, setPalette] = useState<PatchPalette | null>(() => {
        if (!eligible) return null
        const cached = cache.get(team)
        return cached && !(cached instanceof Promise) ? cached : null
    })

    useEffect(() => {
        if (!eligible) {
            setPalette(null)
            return
        }
        const cached = cache.get(team)
        if (cached && !(cached instanceof Promise)) {
            setPalette(cached)
            return
        }
        // Not cached yet (or a load for a DIFFERENT team is still resolving from a previous prop
        // value) — clear to null so a cell never shows a stale team's colours while this one loads.
        setPalette(null)
        let cancelled = false
        const promise = cached ?? loadPalette(team)
        cache.set(team, promise)
        promise
            .then((p) => {
                cache.set(team, p)
                if (!cancelled) setPalette(p)
            })
            .catch(() => {
                // Leave no cache entry so a later mount can retry; the caller's own fallback
                // background is all there is to draw in the meantime.
                cache.delete(team)
            })
        return () => {
            cancelled = true
        }
    }, [team, eligible])

    return palette
}
