'use client'

import {CircleWidget} from '../circleWidget'

export default function Page({params}: {params: {id: string}}) {
    return (
        <CircleWidget
            channelId={parseInt(params.id)}
            endpointKey="widget_stashorpass_get"
            lines={['STASH', 'OR PASS']}
            neonColor="#67e85f"
            neonGlowMid="#98e895"
            circleBackground="#233a13"
            spinDuration={24.5}
        />
    )
}
