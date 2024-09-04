import {FC, useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {GetChannelsChannel, StreamResponse, WNBreak} from "@/app/entity/entities";

interface StreamBreadcrumbsProps {
    streamId: number
}

export const StreamBreadcrumbsComponent: FC<StreamBreadcrumbsProps> = (props) => {
    const [stream, setStream] = useState<StreamResponse|null>(null)

    useEffect(() => {
        post(getEndpoints().stream_get, {id: props.streamId}).then((data: StreamResponse) => setStream(data))
    }, [props.streamId]);

    return (
        <div>
            {
                stream == null
                    ? <a className="nav-link active" href='/streams'>Stream</a>
                    : <a className="nav-link active" href={`/stream/${stream.id}`}>{stream.name}</a>
            }
        </div>
    )
}