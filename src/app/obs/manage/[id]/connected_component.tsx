import {FC} from "react";

interface ConnectedProps {
    isConnected: boolean,
    connect: () => void
}

export const ConnectedComponent: FC<ConnectedProps> = (props) => {
    return <div className='d-flex align-items-center gap-1 justify-content-end'>
        {!props.isConnected && <button onClick={props.connect}>Connect</button>}
        {props.isConnected ? "Connected" : "Not Connected"}
        <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: props.isConnected ? 'green' : 'red',
        }}/>
    </div>
}