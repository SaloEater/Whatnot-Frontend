import React, {FC, useEffect, useState} from "react";
import {WNBreak} from "@/app/entity/entities";
import {Teams} from "@/app/common/teams";
import {getEndpoints, post} from "@/app/lib/backend";
import {useRouter} from "next/navigation";

interface BreakSwitchComponentProps {
    currentBreak: WNBreak
}

export const BreakSwitchComponent: FC<BreakSwitchComponentProps> = (props) => {
    const [breaks, setBreaks] = useState<WNBreak[]>([])
    const router = useRouter()

    useEffect(() => {
        post(getEndpoints().stream_breaks, {id: props.currentBreak.day_id})
            .then((streamBreaks: WNBreak[]) => {
                setBreaks(streamBreaks)
            })
    }, []);

    return (
        <div>
            <div>Go to Break:</div>
            <div className="dropdown">
                <button className="btn btn-secondary dropdown-toggle" type="button" id="dropdownMenuButton1"
                        data-bs-auto-close="true" data-bs-toggle="dropdown" aria-expanded="false">
                    {props.currentBreak.name}
                </button>
                <ul className="dropdown-menu cursor-pointer" aria-labelledby="dropdownMenuButton1">
                    {
                        breaks.filter(i => i.id != props.currentBreak.id).map(i => <li key={i.id} onClick={_ => router.push(`/break/${i.id}`)}
                                           className={`dropdown-item`}>{i.name}</li>)
                    }
                </ul>
            </div>
        </div>
    )
}