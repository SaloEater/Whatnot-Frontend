'use client'

// Exposes the current stage's resolved boxes (obs-layout-plan.md §1.9 "useResolvedBox(key)") so a
// boxless element (`hasBox: false` in registry.ts — e.g. the wrap-around stash-or-pass animation)
// can glue itself to another element's box instead of having one of its own. Populated once per
// render by the layout page (`[id]/page.tsx`'s LayoutStageContent) from the same
// `elementsForPhase()` result it renders from, so it is always in sync with what's on screen.
//
// Boxless elements are deliberately excluded from the map — they have no meaningful box of their
// own, and nothing anchors to a boxless element in the design covered by §1.9 (revisit if that
// changes).

import { createContext, ReactNode, useContext } from 'react'
import type { Box } from './schema'

const ResolvedBoxesContext = createContext<Map<string, Box> | null>(null)

export function ResolvedBoxesProvider({
    boxes,
    children,
}: {
    boxes: Map<string, Box>
    children: ReactNode
}) {
    return <ResolvedBoxesContext.Provider value={boxes}>{children}</ResolvedBoxesContext.Provider>
}

export function useResolvedBox(key: string): Box | undefined {
    const ctx = useContext(ResolvedBoxesContext)
    if (!ctx) {
        throw new Error('useResolvedBox() must be used within a <ResolvedBoxesProvider>')
    }
    return ctx.get(key)
}
