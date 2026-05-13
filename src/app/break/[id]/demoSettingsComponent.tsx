import {useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import './demoSettingsComponent.css'
import {useStream} from "@/app/hooks/useStream";

export default function DemoSettingsComponent({params}: {params: {
        streamId: number,
        breakId: number,
}}) {
    const [stream, refreshStream] = useStream(params.streamId, 20000)
    const [isSetting, setIsSetting] = useState(false)

    useEffect(() => {
        if (stream && !stream.active_break_id) {
            setCurrentBreak()
        }
    }, [stream]);

    function setCurrentBreak() {
        if (!stream) {
            return
        }
        setIsSetting(true)
        post(getEndpoints().stream_set_active_break, {
            stream_id: params.streamId,
            active_break_id: params.breakId,
        }).then(() => {
            refreshStream()
        }).finally(() => {
            setIsSetting(false)
        })
    }

    return <div className='rounded rounded-3 border-primary border p-2'>
        {stream && <div className='w-100p'>
            <div className='pb-3'>
                <div className='fs-4'>Selected break:</div>
                {stream.active_break_id == params.breakId && <div className='bg-green'>
                    Current break is shown
                </div>}
                {stream.active_break_id != params.breakId && <div className='d-flex bg-danger align-items-center'>
                    <div className='w-75p'>Different break is shown</div>
                    <button type='button' className='w-25p btn btn-primary' disabled={isSetting} onClick={setCurrentBreak}>Set</button>
                </div>}
            </div>
        </div>}
    </div>
}
