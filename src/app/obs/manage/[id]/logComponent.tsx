import {FC, useEffect, useState} from "react";
import {ComponentLogger} from "@/app/entity/logger";

export interface LogProps {
    logger: ComponentLogger
}

export const LogComponent: FC<LogProps> = (props) => {
    const [logEntries, setLogEntries] = useState<string[]>([])

    function setLog(entries: string[]) {
        setLogEntries([...entries])
    }

    useEffect(() => {
        props.logger.setSetter(setLog)
    }, []);

    function clearLog() {
        props.logger.clear()
    }

    return <div>
        Log: <span><button onClick={clearLog}>Clear</button></span>
        <div style={{
            overflowY: "scroll",
            maxHeight: '85vh',
        }}>
            {
                logEntries.toReversed().map((i, j) => <div key={j} className='border border-1'>
                    {logEntries.length - j}: {i}
                </div>)
            }
        </div>
    </div>
}