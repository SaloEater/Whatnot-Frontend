import TeamsListComponent from "@/app/break/[id]/teamsListComponent";
import {Event} from "@/app/entity/entities";
import {FC, useState} from "react";
import DemoSettingsComponent from "@/app/break/[id]/demoSettingsComponent";
import {arrayUnique} from "@/app/common/helpers";

const Tabs = [
    'Teams List',
    'Demo'
]
const TeamsListIndex = 0;
const DemoIndex = 1;

interface ToolsTabProps {
    events: Event[],
    changeIndex: (event: Event, newIndex: number) => void,
    breakId: number,
    streamId: number
}

export const ToolsTabComponent: FC<ToolsTabProps> = (props) => {
    const [selectedTabIndex, setSelectedTabIndex] = useState(0)

    function getUsernames() {
        return arrayUnique(props.events.map(i => i.customer));
    }

    return <div>
        <div className='d-flex flex-wrap gap-1 w-100p'>
            {Tabs.map((tabName, j) => <div key={j} className={`p-2 border border-dashed  ${selectedTabIndex == j ? 'bg-primary' : ''}`} onClick={_ => {
                setSelectedTabIndex(j)
            }}>
                <strong>{tabName}</strong>
            </div>)}
        </div>
        {selectedTabIndex == TeamsListIndex && <TeamsListComponent params={{events: props.events, changeIndex: props.changeIndex}} />}
        {selectedTabIndex == DemoIndex && <DemoSettingsComponent params={{streamId: props.streamId, breakId: props.breakId, usernames: getUsernames()}} />}
    </div>
}