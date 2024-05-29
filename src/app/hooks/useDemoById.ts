import {memo, useEffect, useMemo, useState} from "react";
import {Demo} from "@/app/entity/entities";
import {getEndpoints, post} from "@/app/lib/backend";

export function useDemoById(demoId: number|null) {
    const [demo, setDemo] = useState<Demo|null>(null)
    const [id, setId] = useState<NodeJS.Timeout|null>(null)

    function refreshDemo (){
        let eventsBody = {
            id: demoId
        };

        post(getEndpoints().demo_get, eventsBody)
            .then((response: Demo) => {
                setDemo(response)
            })
    }

    useEffect(() => {
        if (demoId == null) {
            setDemo(null)
            return
        }

        refreshDemo()
        if (id) {
            clearInterval(id)
            setId(null)
        }
        setId(setInterval(() => {
            refreshDemo()
        }, 20000))
    }, [demoId]);

    return demo
}