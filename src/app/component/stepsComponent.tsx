import {FC, JSX, useState} from "react";

interface Step {
    node: JSX.Element
    name: string
}

interface StepsProps {
    steps: Step[]
}

export const StepsComponent: FC<StepsProps> = (props) => {
    const [index, setIndex] = useState(0)
    let step = props.steps[index]
    return <div className='d-flex flex-column gap-2'>
        <div className='d-flex justify-content-center gap-2'>
            {index > 0 && <button className='btn btn-sm btn-secondary' disabled={index <= 0} onClick={_ => setIndex(old => old-1)}>Previous{` (${props.steps[index - 1].name})`}</button>}
            <b className='fs-4 border border-1 rounded-3 p-2'>{step.name}</b>
            {index < props.steps.length - 1 && <button className='btn btn-sm btn-secondary' disabled={index >= props.steps.length - 1} onClick={_ => setIndex(old => old+1)}>Next{` (${props.steps[index + 1].name})`}</button>}
        </div>
        {step.node}
    </div>
}