import TeamsListComponent from "@/app/break/[id]/teamsListComponent";
import {Event, WNBreak} from "@/app/entity/entities";
import React, {FC, useState} from "react";
import DemoSettingsComponent from "@/app/break/[id]/demoSettingsComponent";
import {DataComponent} from "@/app/break/[id]/dataComponent";

const Tabs = [
    'Teams List',
    'Demo',
    'Data'
]
const TeamsListIndex = 0;
const DemoIndex = 1;
const DataIndex = 2;

interface ToolsTabProps {
    events: Event[],
    changeIndex: (event: Event, newIndex: number) => void,
    breakO: WNBreak,
    streamId: number
    highBidTeam: string
    giveawayTeam: string
    updateHighBidFloor: (value: number) => void
}

export const ToolsTabComponent: FC<ToolsTabProps> = (props) => {
    const [selectedTabIndex, setSelectedTabIndex] = useState(DemoIndex)

    return <div>
        <div className='d-flex flex-wrap gap-1 w-100p'>
            {Tabs.map((tabName, j) => <div key={j} className={`p-2 border border-dashed  ${selectedTabIndex == j ? 'bg-primary' : ''}`} onClick={_ => {
                setSelectedTabIndex(j)
            }}>
                <strong>{tabName}</strong>
            </div>)}
        </div>
        {selectedTabIndex == TeamsListIndex && <TeamsListComponent params={{events: props.events, changeIndex: props.changeIndex}} />}
        {selectedTabIndex == DemoIndex && <DemoSettingsComponent params={{streamId: props.streamId, breakId: props.breakO.id}} />}
        {selectedTabIndex == DataIndex && <DataComponent events={props.events} highBidTeam={props.highBidTeam} giveawayTeam={props.giveawayTeam} highBidFloor={props.breakO.high_bid_floor} updateHighBidFloor={props.updateHighBidFloor}/>}
    </div>
}