import './page.css'
import {FC, useEffect, useRef, useState} from "react";
import {Event} from "@/app/entity/entities";
import {getSpotAbbreviation} from "@/app/common/spot_label";
import './eventComponent.css'

interface CustomSpotProps {
    event: Event,
    initEvent: (event: Event) => void,
    resetEvent: (event: Event) => void;
}

export const CustomSpotComponent: FC<CustomSpotProps> = (props) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [showVideo, setShowVideo] = useState<boolean>(false);

    const isTaken = props.event.customer != '';

    useEffect(() => {
        if (props.event.customer !== '') {
            // Show video when customer is set
            setShowVideo(true);

            // If you need to restart the video when customer changes
            if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(err => console.error("Video play error:", err));
            }
        } else {
            // Hide video when customer is empty
            setShowVideo(false);
        }
    }, [props.event.customer]);

    return <div ref={containerRef} className='grid-item position-relative giveaway-parent'>
        <div className={`custom-spot-tile ${isTaken ? 'taken' : ''}`}>
            <span className='bigboz-font custom-spot-text'>{getSpotAbbreviation(props.event.team)}</span>
        </div>
        {showVideo && (
            <div className="position-absolute" style={{top: "-275%", left: "-275%", width: '100%', height: '100%', zIndex: 1000}}>
                <video
                    ref={videoRef}
                    width="650%"
                    height="650%"
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
}
