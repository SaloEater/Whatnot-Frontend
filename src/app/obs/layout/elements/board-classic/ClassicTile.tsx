import {useEffect, useRef, useState} from "react"
import {Event} from "@/app/entity/entities"

// Ported from obs/[id]/eventComponent.tsx. Drops the `initEvent`/`resetEvent` props and the
// `isGiveawayTeam`/giveaway-text spans (dead — their content was already commented out in the old
// file) since the layout board is read-only (obs-layout-plan.md §2.10.2).
//
// `alreadySettled` (mirrors FlatBoard's flatEventComponent.tsx): true for a tile that was ALREADY
// sold in ClassicBoard's very first events snapshot — such a tile renders its sold (BW) image
// straight away with no burst. Only a tile that flips from unsold to sold AFTER that snapshot
// plays `press_animation.webm`. `onBurstComplete` reports the id back up once the burst finishes
// so ClassicBoard can fold it into the settled set (a later reset-then-resell plays the burst
// again, same as FlatBoard's flip).
interface ClassicTileProps {
    event: Event
    alreadySettled: boolean
    onBurstComplete: (id: number) => void
}

export function ClassicTile({event, alreadySettled, onBurstComplete}: ClassicTileProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const sold = event.customer !== ''
    const [showVideo, setShowVideo] = useState(false)

    useEffect(() => {
        if (sold && !alreadySettled) {
            setShowVideo(true)
            if (videoRef.current) {
                videoRef.current.currentTime = 0
                videoRef.current.play().catch(err => console.error("Video play error:", err))
            }
        } else {
            setShowVideo(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event.customer, alreadySettled])

    function handleEnded() {
        setShowVideo(false)
        onBurstComplete(event.id)
    }

    const src = `/images/new_teams/${event.team}${sold ? ' BW' : ''}.png`

    return (
        <div className="classic-tile position-relative">
            <img className="classic-tile-img" src={src} alt={event.team}/>
            {showVideo && (
                <div className="classic-video-wrap position-absolute">
                    <video
                        ref={videoRef}
                        width="650%"
                        height="650%"
                        autoPlay
                        muted
                        playsInline
                        onEnded={handleEnded}
                    >
                        <source src="/videos/press_animation.webm" type="video/webm"/>
                    </video>
                </div>
            )}
        </div>
    )
}

export default ClassicTile
