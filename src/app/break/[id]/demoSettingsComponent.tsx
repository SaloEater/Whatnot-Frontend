import {Demo, Event, NoDemoBreak} from "@/app/entity/entities";
import {useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import './demoSettingsComponent.css'
import {SuggestionsComponent} from "@/app/common/suggestionsComponent";
import {TextInputWithSuggestions} from "@/app/common/textInputWithSuggestions";
import {useDemo} from "@/app/hooks/useDemo";

export default function DemoSettingsComponent({params}: {params: {
        usernames: string[],
        streamId: number,
        breakId: number,
}}) {
    const demo = useDemo(params.streamId)
    const [highlightUsername, setHighlightUsername] = useState('')
    const [isSetting, setIsSetting] = useState(false)

    useEffect(() => {
        if (demo) {
            setHighlightUsername(demo.highlight_username)
            if (demo.break_id == NoDemoBreak) {
                setCurrentBreak()
            }
        } else {
            setHighlightUsername('')
        }
    }, [demo]);

    function setCurrentBreak() {
        if (!demo) {
            return
        }
        let body: Demo  = {...demo}
        body.break_id = params.breakId
        setIsSetting(true)
        post(getEndpoints().demo_update, body)
            .then((response: Demo) => {
                if (demo) {
                    demo.break_id = params.breakId
                }
            }).finally(() => {
                setIsSetting(false)
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
                if (demo) {
                    demo.highlight_username = body.highlight_username
                }
            })
    }

    function updateHighlightUsername(username: string) {
        setHighlightUsername(username)
        saveHighlightUsername(username)
    }

    return <div className='rounded rounded-3 border-primary border p-2'>
        {demo && <div className='w-100p'>
            <div className='pb-3'>
                <div className='fs-4'>Selected break:</div>
                {demo.break_id == params.breakId && <div className='bg-green'>
                    Current break is shown
                </div>}
                {demo.break_id != params.breakId && <div className='d-flex bg-danger align-items-center'>
                    <div className='w-75p'>Different break is shown</div>
                    <button type='button' className='w-25p btn btn-primary' disabled={isSetting} onClick={setCurrentBreak}>Set</button>
                </div>}
            </div>
            {
                demo.break_id == params.breakId && <div>
                    <div className='fs-4'>Highlight username:</div>
                    <button type='button' className='btn btn-primary' onClick={_ => {
                        updateHighlightUsername('')
                    }}>Clear</button>
                    <TextInputWithSuggestions
                        value={highlightUsername}
                        update={setHighlightUsername}
                        save={saveHighlightUsername}
                        max_width={50} font_size={null}
                        placeholder={'Enter username'}
                        onClick={null}
                        onBlur={null}
                        suggestions={params.usernames}
                        alwaysOn={true}
                        disabled={false}
                    />
                </div>
            }
        </div>}
    </div>
}