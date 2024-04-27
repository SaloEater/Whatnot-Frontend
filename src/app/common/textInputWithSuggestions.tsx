import './textInput.css'
import {FC, useEffect, useState} from "react";
import TextInput from "@/app/common/textInput";
import {SuggestionsComponent} from "@/app/common/suggestionsComponent";
import './textInputWithSuggestions.css'

interface TextInputWithSuggestionsProps {
    value: string,
    update: (value: string) => void,
    save: (value: string|null) => void,
    max_width: number,
    font_size: number|null,
    placeholder: string,
    onClick: (() => void) | null,
    onBlur: (() => void) | null,
    suggestions: string[]
    alwaysOn: boolean,
    disabled: false,
}

export const TextInputWithSuggestions: FC<TextInputWithSuggestionsProps> = (props) => {
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [closeSuggestions, setCloseSuggestions] = useState(false)
    const [closeTimeout, setCloseTimeout] = useState<NodeJS.Timeout|null>(null)
    const [value, setValue] = useState(props.value)

    useEffect(() => {
        setValue(props.value)
    }, [props.value]);

    useEffect(() => {
        if (closeSuggestions) {
            let tid = setTimeout(() => {
                if (closeSuggestions) {
                    setShowSuggestions(false)
                }
                setCloseTimeout(null)
            }, 150)
            setCloseTimeout(tid)
        } else {
            if (closeTimeout) {
                clearTimeout(closeTimeout)
                setCloseTimeout(null)
            }
        }
    }, [closeSuggestions]);
    
    let style = {
        //maxWidth: `${props.max_width}px`,
        fontSize: props.font_size ? `${props.font_size}px` : '16px',
    };

    function itemClicked(value: string) {
        setValue(value)
        props.save(value)
    }

    const textInputParams = {...props}
    textInputParams.onClick = () => {
        setShowSuggestions(true)
        setCloseSuggestions(false)
        if (props.onClick) {
            props.onClick()
        }
    }
    textInputParams.onBlur = () => {
        props.save(null)
        setCloseSuggestions(true)
        if (props.onBlur) {
            props.onBlur()
        }
    }
    textInputParams.value = value

    return <div>
        <TextInput params={textInputParams}/>
        {props.suggestions.length > 0 && (showSuggestions || props.alwaysOn) && <SuggestionsComponent suggestions={props.suggestions} value={value} itemClicked={itemClicked}/>}
    </div>
}