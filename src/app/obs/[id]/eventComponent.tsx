import './page.css'
import {FC, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {GetEventsByBreakResponse, Event} from "@/app/entity/entities";
import {filterOnlyTeams} from "@/app/common/event_filter";

interface OBSEventProps {
    event: Event,
    initEvent: (event: Event) => void,
    resetEvent: (event: Event) => void;
}

// @ts-ignore
export const EventComponent: FC<OBSEventProps> = (props) => {
    const oldEvent = useRef<Event>()
    const [isPicked, setIsPicked] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDimmed, setIsDimmed] = useState(false)

    useEffect(() => {
        if (oldEvent.current) {
            if (oldEvent.current?.customer == '' && props.event.customer != '') {
                console.log(props.event.team, props.event.customer, 'picked')
                setIsPicked(true)
            } else if (oldEvent.current?.customer != '' && props.event.customer == '') {
                setIsPicked(false)
                setIsDimmed(false)
                console.log(props.event.team, props.event.customer, 'unpicked')
            }
        } else if (props.event.customer != '') {
            setIsDimmed(true)
            console.log(props.event.team, props.event.customer, 'default picked')
        }
        oldEvent.current = props.event
    }, [props.event.customer]);

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

    function activate() {
        if (!props.event.customer) {
            props.initEvent(props.event)
        } else {
            props.resetEvent(props.event)
        }
    }

    return <div ref={containerRef} className={'grid-item ' + (isDimmed ? 'dimmed' : '')}>
        <img className='team-image' src={getTeamImageSrc(props.event.team)} onClick={activate}/>
    </div>
}