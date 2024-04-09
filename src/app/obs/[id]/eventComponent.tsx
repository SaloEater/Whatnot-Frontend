import './page.css'
import {useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {GetEventsByBreakResponse, Event} from "@/app/entity/entities";
import {filterOnlyTeams} from "@/app/common/event_filter";

// @ts-ignore
export default function EventComponent({event}) {
    const oldEvent = useRef<Event>()
    const [isPicked, setIsPicked] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDimmed, setIsDimmed] = useState(false)

    useEffect(() => {
        if (oldEvent.current) {
            if (oldEvent.current?.customer == '' && event.customer != '') {
                setIsPicked(true)
            } else if (oldEvent.current?.customer != '' && event.customer == '') {
                setIsPicked(false)
                setIsDimmed(false)
            } else if (event.customer != '') {
                setIsDimmed(true)
            }
        }
        oldEvent.current = event
    }, [event.customer]);

    useEffect(() => {
        let container = containerRef.current
        if (!container) return
        let cb = () => {
            container.style.animation = '';
        }
        let cbStart = () => {
            setTimeout(() => setIsDimmed(true), 500)
        }
        container.addEventListener('animationstart', cbStart)
        container.addEventListener('animationend', cb)

        return () => {
            // Clean up event listener
            container.addEventListener('animationstart', cbStart)
            container.removeEventListener('animationend', cb);
        };
    }, [containerRef]);

    useEffect(() => {
        if (isPicked && containerRef.current) {
            let container = containerRef.current
            container.style.animation = 'itemAnimation 1s ease';
        }
    }, [isPicked]);

    function getTeamImageSrc(team: string) {
        return `/images/teams/${team}.webp`;
    }

    return <div ref={containerRef} className={'grid-item ' + (isDimmed ? 'dimmed' : '')}>
        <img className='team-image' src={getTeamImageSrc(event.team)}/>
    </div>
}