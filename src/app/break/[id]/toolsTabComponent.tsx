import TeamsListComponent from "@/app/break/[id]/teamsListComponent";
import {Event} from "@/app/entity/entities";
import {useState} from "react";
import DemoSettingsComponent from "@/app/break/[id]/demoSettingsComponent";

const Tabs = [
    'Teams List',
    'Demo'
]
const TeamsListIndex = 0;
const DemoIndex = 1;

export default function ToolsTabComponent({params}: {params: {
    events: Event[],
    changeIndex: (event: Event, newIndex: number) => void,
    breakId: number,
    streamId: number,
}}) {
    const [selectedTabIndex, setSelectedTabIndex] = useState(0)

    return <div>
        <div className='d-flex flex-wrap gap-1 w-100p'>
            {Tabs.map((tabName, j) => <div key={j} className={`p-2 border border-dashed  ${selectedTabIndex == j ? 'bg-primary' : ''}`} onClick={_ => {
                setSelectedTabIndex(j)
            }}>
                <strong>{tabName}</strong>
            </div>)}
        </div>
        {selectedTabIndex == TeamsListIndex && <TeamsListComponent params={{events: params.events, changeIndex: params.changeIndex}} />}
        {selectedTabIndex == DemoIndex && <DemoSettingsComponent params={{streamId: params.streamId, breakId: params.breakId}} />}
    </div>
}