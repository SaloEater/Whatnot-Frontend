'use client'

import {CircleWidget} from '../circleWidget'

export default function Page({params}: {params: {id: string}}) {
    return (
        <CircleWidget
            channelId={parseInt(params.id)}
            endpointKey="widget_pick2_get"
            lines={['SPIN 2', 'CHOOSE 1']}
            neonColor="#76d7d8"
            neonGlowMid="#9bd7d8"
            circleBackground="#293d56"
            spinDuration={24}
        />
    )
}
