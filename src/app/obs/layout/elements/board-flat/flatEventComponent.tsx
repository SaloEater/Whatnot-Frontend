import {FC, useEffect, useState} from "react";
import {Event} from "@/app/entity/entities";
import {Exposure} from "./tiles/types";
import {Manifest} from "./tiles/manifest";
import {CellSkin} from "./CellSkin";
import './flatEventComponent.css'

// Ported from obs/[id]/flat/flatEventComponent.tsx. The press-video overlay there is dead code
// (permanently disabled via ENABLE_PRESS_VIDEO = false) — dropped entirely in this port rather
// than carried over dormant (obs-layout-plan.md §2.1 leaves this choice to the coder). The old
// route is untouched.
//
// `alreadySettled` (new vs. the old route, obs-layout-plan.md §2.1): true for a cell that was
// ALREADY sold in FlatBoard's very first events snapshot — i.e. one FlatBoard inherited on mount
// rather than one that sold while it was watching. Such a cell renders straight into its final
// flipped state via the static `flat-cell-final` class, which carries no `animation` — CSS
// animations only play when the class that declares them is present on an element at the moment
// it's inserted (or its properties change), so a synchronously-known "already flipped" cell never
// starts one. A cell that flips AFTER mount is not yet in `settled` when it first renders flipped,
// so it gets the real animated class instead. This is what stops a fresh mount (or a phase-switch
// remount) with 30 already-sold cells from playing 30 simultaneous flips.
interface FlatEventProps {
    event: Event
    /** Skin data for this cell's group (present only when flipped). */
    manifest?: Manifest | null
    exposure?: Exposure
    styleId?: string
    tier?: number
    /** True if this cell was already sold at FlatBoard's initial mount snapshot. */
    alreadySettled?: boolean
    /** Called once this cell's flip animation has finished. */
    onFlipComplete?: (id: number) => void
}

export const FlatEventComponent: FC<FlatEventProps> = ({event, manifest, exposure, styleId, tier, alreadySettled, onFlipComplete}) => {
    const flipped = event.customer !== ''
    // A cell already sold at mount renders in its final state directly — no animation to run, so
    // no "flipping" z-index bump either.
    const skipAnimation = flipped && !!alreadySettled
    const [animating, setAnimating] = useState(false)

    useEffect(() => {
        setAnimating(flipped && !skipAnimation)
    }, [flipped, skipAnimation])

    const contentClass = flipped ? (skipAnimation ? 'flat-cell-final' : 'flat-cell-flipped') : ''

    return (
        <div className={`flat-cell ${animating ? 'flat-cell-flipping' : ''}`}>
            <div className={`flat-cell-content ${contentClass}`} onAnimationEnd={() => { setAnimating(false); if (flipped) onFlipComplete?.(event.id) }}>
                <img className="flat-cell-image flat-cell-face" src={`/images/new_teams/${event.team}.png`} alt={event.team} />
                <div className="flat-cell-image flat-cell-face flat-cell-back">
                    {manifest && exposure && styleId && tier ? (
                        <CellSkin manifest={manifest} exposure={exposure} styleId={styleId} tier={tier} cellKey={String(event.id)} />
                    ) : (
                        <img className="flat-cell-image" src="/images/new_teams/Cross 2 BW.png" alt="Cross" />
                    )}
                </div>
            </div>
        </div>
    )
}
