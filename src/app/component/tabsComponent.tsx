import {FC, JSX, useState} from "react";

interface Tab {
    node: JSX.Element
    name: string
}

interface TabsProps {
    tabs: Tab[]
}

export const TabsComponent: FC<TabsProps> = (props) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    return <div>
        <div className='d-flex'>
            {
                props.tabs.map(
                    (i, j) => <div key={j} className={`p-2 border border-dashed ${selectedIndex == j ? 'bg-primary' : ''}`} onClick={_ => setSelectedIndex(j)}>
                        {i.name}
                    </div>
                )
            }
        </div>
        {props.tabs[selectedIndex].node}
    </div>
}