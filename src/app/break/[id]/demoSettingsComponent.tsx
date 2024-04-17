import {Demo, Event} from "@/app/entity/entities";
import {useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import TextInput from "@/app/common/textInput";
import './demoSettingsComponent.css'

export default function DemoSettingsComponent({params}: {params: {
        usernames: string[],
        streamId: number,
        breakId: number,
}}) {
    const [demo, setDemo] = useState<Demo|null>(null)
    const [highlightUsername, setHighlightUsername] = useState('')
    const [showUsernames, setShowUsernames] = useState(false)
    const [closeUsernames, setCloseUsername] = useState(false)
    const [closeTimeout, setCloseTimeout] = useState<NodeJS.Timeout|null>(null)

    useEffect(() => {
        if (closeUsernames) {
            let tid = setTimeout(() => {
                if (closeUsernames) {
                    setShowUsernames(false)
                }
                setCloseTimeout(null)
            }, 350)
            setCloseTimeout(tid)
        } else {
            if (closeTimeout) {
                clearTimeout(closeTimeout)
                setCloseTimeout(null)
            }
        }
    }, [closeUsernames]);

    useEffect(() => {
        refreshDemo()
    }, []);

    function refreshDemo() {
        let body  = {
            stream_id: params.streamId
        }
        post(getEndpoints().stream_demo, body)
            .then((response: Demo) => {
                setDemo(response)
                setHighlightUsername(response.highlight_username)
            })
    }

    function setCurrentBreak() {
        if (!demo) {
            return
        }
        let body: Demo  = {...demo}
        body.break_id = params.breakId
        post(getEndpoints().demo_update, body)
            .then((response: Demo) => {
                setDemo((old) => {
                    if (!old) {
                        return old
                    }
                    let newD = {...old}
                    old.break_id = params.breakId
                    return newD
                })
            })
    }

    function saveHighlightUsername(forceValue: string|null = null) {
        if (!demo) {
            return
        }
        let body: Demo  = {...demo}
        body.highlight_username = forceValue != null ? forceValue : highlightUsername
        post(getEndpoints().demo_update, body)
            .then((response: Demo) => {
                setDemo((old) => {
                    if (!old) {
                        return old
                    }
                    let newD = {...old}
                    old.highlight_username = body.highlight_username
                    return newD
                })
            })
    }

    return <div className='rounded rounded-3 border-primary border p-2'>
        {demo && <div className='w-100p'>
            <div className='pb-3'>
                <div className='fs-4'>Selected break:</div>
                {demo.break_id == params.breakId && <div className='bg-green'>
                    Current break is shown
                </div>}
                {demo.break_id != params.breakId && <div className='d-flex bg-danger align-items-center'>
                    <div className='w-50p'>Different break is shown</div>
                    <button type='button' className='w-50p btn btn-primary' onClick={setCurrentBreak}>Set To Current Break</button>
                </div>}
            </div>
            <div>
                <div className='fs-4'>Highlight username:</div>
                <TextInput params={{
                    value: highlightUsername,
                    update: setHighlightUsername,
                    save: saveHighlightUsername,
                    max_width: 50,
                    placeholder: 'Enter username',
                    font_size: null,
                    onClick: null,
                    onBlur: null,
                    // onClick: () => {
                    //     setShowUsernames(true)
                    //     setCloseUsername(false)
                    // },
                    // onBlur: () => {
                    //     setCloseUsername(true)
                    // },
                }}/>
                {
                    true && <div className='d-flex flex-wrap gap-1'>
                        {
                            params.usernames.map(i => <div key={i} className='border-dashed hovered-bg cursor-pointer' onClick={_ => {
                                saveHighlightUsername(i)
                                setHighlightUsername(i)
                            }}>
                                {i}
                            </div>)
                        }
                    </div>
                }
                <button type='button' className='btn btn-primary' onClick={_ => {
                    saveHighlightUsername('')
                    setHighlightUsername('')
                }}>Clear</button>
            </div>
        </div>}
    </div>
}