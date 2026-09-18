import {useEffect, useRef, useState} from "react"
import {Event} from "@/app/entity/entities"
import {getSpotAbbreviation} from "@/app/common/spot_label"

// Ported from obs/[id]/customSpotComponent.tsx. Same read-only + settled-baseline treatment as
// ClassicTile.tsx — see that file's header.
interface ClassicCustomSpotProps {
    event: Event
    alreadySettled: boolean
    onBurstComplete: (id: number) => void
}

export function ClassicCustomSpot({event, alreadySettled, onBurstComplete}: ClassicCustomSpotProps) {
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

    return (
        <div className={`classic-custom-tile position-relative ${sold ? 'classic-taken' : ''}`}>
            <span className="bigboz-font classic-custom-text">{getSpotAbbreviation(event.team)}</span>
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

export default ClassicCustomSpot
