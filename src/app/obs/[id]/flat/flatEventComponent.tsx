import {FC, useEffect, useRef, useState} from "react";
import {Event} from "@/app/entity/entities";
import './flatEventComponent.css'

interface FlatEventProps {
    event: Event
}

export const FlatEventComponent: FC<FlatEventProps> = ({event}) => {
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
        // flip animation is 1.2s; start the video 100ms before it ends
        const t = setTimeout(() => playVideo(), 1050)
        return () => clearTimeout(t)
    }, [flipped])

    return (
        <div className={`flat-cell ${animating ? 'flat-cell-flipping' : ''} ${showVideo ? 'flat-cell-active' : ''}`}>
            <div className={`flat-cell-content ${flipped ? 'flat-cell-flipped' : ''}`} onAnimationEnd={() => setAnimating(false)}>
                <img className="flat-cell-image flat-cell-face" src={`/images/new_teams/${event.team}.png`} alt={event.team} />
                <img className="flat-cell-image flat-cell-face flat-cell-back" src="/images/new_teams/Cross 2 BW.png" alt="Cross" />
            </div>
            {showVideo && (
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
