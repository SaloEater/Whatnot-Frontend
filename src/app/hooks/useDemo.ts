import {useEffect, useState} from "react";
import {Demo} from "@/app/entity/entities";
import {getEndpoints, post} from "@/app/lib/backend";

export function useDemo(streamId: number) {
    const [demo, setDemo] = useState<Demo|null>(null)
    function refreshDemo (){
        let eventsBody = {
            stream_id: streamId
        };

        post(getEndpoints().stream_demo, eventsBody)
            .then((response: Demo) => {
                if (!demo || response.id != demo.id) {
                    setDemo(response)
                }
            })
    }

    useEffect(() => {
        refreshDemo()
        let id = setInterval(() => {
            refreshDemo()
        }, 20000)
        return (() => {
            clearInterval(id)
        })
    }, []);

    return demo
}