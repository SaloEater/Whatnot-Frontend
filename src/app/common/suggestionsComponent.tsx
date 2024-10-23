import {FC} from "react";

interface SuggestionsProps {
    suggestions: string[]
    itemClicked: (username: string) => void,
    value: string
}

export const SuggestionsComponent: FC<SuggestionsProps> = (props) => {
    return <div className='d-flex flex-wrap gap-1'>
        {
            props.suggestions.filter(i => i.indexOf(props.value) != -1).map(i => <div key={i} className={`border-dashed hovered-bg cursor-pointer ${props.value == i ? 'bg-primary' : ''}`} onClick={_ => {
                props.itemClicked(i)
            }}>
                {i}
            </div>)
        }
    </div>
}