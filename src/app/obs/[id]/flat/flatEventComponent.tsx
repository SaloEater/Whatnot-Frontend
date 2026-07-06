import {FC, useEffect, useRef, useState} from "react";
import {Event} from "@/app/entity/entities";
import {Exposure} from "./tiles/types";
import {Manifest} from "./tiles/manifest";
import {CellSkin} from "./CellSkin";
import './flatEventComponent.css'

// TEMP: press video disabled while iterating on the tile textures. Set back to
// true to restore the flip press animation.
const ENABLE_PRESS_VIDEO = false

interface FlatEventProps {
    event: Event
    /** Skin data for this cell's group (present only when flipped). */
    manifest?: Manifest | null
    exposure?: Exposure
    styleId?: string
    tier?: number
    /** Called once this cell's flip animation has finished. */
    onFlipComplete?: (id: number) => void
}

export const FlatEventComponent: FC<FlatEventProps> = ({event, manifest, exposure, styleId, tier, onFlipComplete}) => {
    const flipped = event.customer !== ''
    const [showVideo, setShowVideo] = useState(false)
    const [animating, setAnimating] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)

    function playVideo() {
        setShowVideo(true)
    }

    useEffect(() => {
        if (showVideo && videoRef.current) {
            videoRef.current.currentTime = 0
            videoRef.current.play().catch(() => {})
        }
    }, [showVideo])

    useEffect(() => {
        if (!flipped) {
            setShowVideo(false)
            setAnimating(false)
            return
        }
        setAnimating(true)
        if (!ENABLE_PRESS_VIDEO) return
        // flip animation is 1.2s; start the video 100ms before it ends
        const t = setTimeout(() => playVideo(), 1050)
        return () => clearTimeout(t)
    }, [flipped])

    return (
        <div className={`flat-cell ${animating ? 'flat-cell-flipping' : ''} ${showVideo ? 'flat-cell-active' : ''}`}>
            <div className={`flat-cell-content ${flipped ? 'flat-cell-flipped' : ''}`} onAnimationEnd={() => { setAnimating(false); if (flipped) onFlipComplete?.(event.id) }}>
                <img className="flat-cell-image flat-cell-face" src={`/images/new_teams/${event.team}.png`} alt={event.team} />
                <div className="flat-cell-image flat-cell-face flat-cell-back">
                    {manifest && exposure && styleId && tier ? (
                        <CellSkin manifest={manifest} exposure={exposure} styleId={styleId} tier={tier} cellKey={String(event.id)} />
                    ) : (
                        <img className="flat-cell-image" src="/images/new_teams/Cross 2 BW.png" alt="Cross" />
                    )}
                </div>
            </div>
            {ENABLE_PRESS_VIDEO && showVideo && (
                <div className="flat-video-overlay">
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        onEnded={() => setShowVideo(false)}
                    >
                        <source src="/videos/press_animation.webm" type="video/webm" />
                    </video>
                </div>
            )}
        </div>
    )
}
