import {useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {Break} from "@/app/entity/entities";

export default function BreakBreadcrumbs({params} : {params: {breakId: number}}) {
    const [dayId, setDayId] = useState<number|null>(null)

    useEffect(() => {
        let body = {
            id: params.breakId
        }
        post(getEndpoints().break_get, body)
            .then((response: Break) => {
                setDayId(response.day_id)
            })
    }, []);

    return (
        <div>
            {
                dayId && <a className="nav-link active" href={`/day/${dayId}`}>Day {dayId}</a>
            }
        </div>
    )
}