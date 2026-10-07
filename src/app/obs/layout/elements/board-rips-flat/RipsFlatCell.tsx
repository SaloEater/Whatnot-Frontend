import {FC, useEffect, useState} from 'react'
import {Event} from '@/app/entity/entities'
import {Exposure} from '../board-flat/tiles/types'
import {Manifest} from '../board-flat/tiles/manifest'
import {CellSkin} from '../board-flat/CellSkin'
import './RipsFlatCell.css'

// Adapted from board-flat/flatEventComponent.tsx (copied, not imported — the front face differs,
// rips-flat-board-plan.md §5). Front: flat's team icon on its own (its baked-in gold octagon is the
// only frame; the Frame_Empty.png overlay was removed 2026-10-07 on request). Back: flat's CellSkin.
// `alreadySettled` has flat's meaning: a cell sold at mount renders straight into the static
// `rfb-cell-final` class (no animation), so a fresh mount never replays every flip at once.
interface Props {
    event: Event
    manifest?: Manifest | null
    exposure?: Exposure
    styleId?: string
    tier?: number
    alreadySettled?: boolean
    onFlipComplete?: (id: number) => void
    style?: React.CSSProperties
}

export const RipsFlatCell: FC<Props> = ({event, manifest, exposure, styleId, tier, alreadySettled, onFlipComplete, style}) => {
    const flipped = event.customer !== ''
    const skipAnimation = flipped && !!alreadySettled
    const [animating, setAnimating] = useState(false)

    useEffect(() => {
        setAnimating(flipped && !skipAnimation)
    }, [flipped, skipAnimation])

    const contentClass = flipped ? (skipAnimation ? 'rfb-cell-final' : 'rfb-cell-flipped') : ''

    return (
        <div className={`rfb-cell ${animating ? 'rfb-cell-flipping' : ''}`} style={style}>
            <div className={`rfb-cell-content ${contentClass}`} onAnimationEnd={() => { setAnimating(false); if (flipped) onFlipComplete?.(event.id) }}>
                <div className="rfb-face rfb-front">
                    <div className="rfb-tile">
                        {/* eslint-disable-next-line @next/next/no-img-element -- plain <img>, same as every other layout element */}
                        <img className="rfb-icon" src={`/images/new_teams/${event.team}.png`} alt={event.team} />
                    </div>
                </div>
                <div className="rfb-face rfb-back">
                    {manifest && exposure && styleId && tier ? (
                        <CellSkin manifest={manifest} exposure={exposure} styleId={styleId} tier={tier} cellKey={String(event.id)} />
                    ) : (
                        <div className="rfb-back-fallback" />
                    )}
                </div>
            </div>
        </div>
    )
}
