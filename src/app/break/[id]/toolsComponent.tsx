import SwapComponent from "@/app/break/[id]/swapComponent";
import {Event} from "@/app/entity/entities";
import {useState} from "react";

export default function ToolsComponent({params}: {params: {
    events: Event[],
    swapTeams: (a: Event[], b: Event[]) => void,
}}) {
    const [showSwap, setShowSwap] = useState(false)

    function switchSwap() {
        setShowSwap((old) => !old)
    }

    return <div>
        {
            showSwap && <SwapComponent params={{
                swapTeams: params.swapTeams,
                events: params.events,
                onClose: () => {setShowSwap(false)}
            }}/>
        }
        <div className='d-flex align-items-center'>Tools:</div>
        <button type='button' className='btn btn-primary' onClick={switchSwap}>Swap teams</button>
    </div>
}