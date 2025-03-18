import './page.css'
import {FC, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {GetEventsByBreakResponse, Event} from "@/app/entity/entities";
import {filterOnlyTeams} from "@/app/common/event_filter";
import './eventComponent.css'

interface OBSEventProps {
    event: Event,
    initEvent: (event: Event) => void,
    resetEvent: (event: Event) => void;
    isGiveawayTeam: boolean
}

// @ts-ignore
export const EventComponent: FC<OBSEventProps> = (props) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [showVideo, setShowVideo] = useState<boolean>(false);

    function getTeamImageSrc() {
        return `/images/new_teams/${props.event.team}${props.event.customer == '' ? '' : ' BW'}.png`;
    }

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
        <img className='team-image' src={getTeamImageSrc()}/>
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
        {props.isGiveawayTeam && <span className='bigboz-font position-absolute giveaway-text fs-1'>
            {/*Free*/}
        </span>}
        {props.isGiveawayTeam && <span className='bigboz-font position-absolute giveaway-text giveaway-text-bottom fs-1'>
            {/*Team*/}
        </span>}
    </div>
}