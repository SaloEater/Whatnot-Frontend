import {FC, useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {GetChannelsChannel, GetStreamsStream, WNBreak} from "@/app/entity/entities";

interface ChannelBreadcrumbsProps {
    streamId: number
}

export const ChannelBreadcrumbsComponent: FC<ChannelBreadcrumbsProps> = (props) => {
    const [channel, setChannel] = useState<GetChannelsChannel|null>(null)

    useEffect(() => {
        post(getEndpoints().channel_by_stream, {stream_id: props.streamId}).then((data: GetChannelsChannel) => setChannel(data))
    }, [props.streamId]);

    return (
        <div>
            {
                channel == null
                    ? <a className="nav-link active" href='/channels'>Channel</a>
                    : <a className="nav-link active" href={`/channel/${channel.id}`}>{channel.name}</a>
            }
        </div>
    )
}