import './textInput.css'
import {FC} from "react";

interface TextInputProps {
    value: string,
    update: (value: string) => void,
    save: (value: string|null) => void,
    font_size: number|null,
    placeholder: string,
    onClick: (() => void) | null,
    onBlur: (() => void) | null,
    disabled: boolean,
}

export const TextInput: FC<TextInputProps> = (params) => {
    let style = {
        fontSize: params.font_size ? `${params.font_size}px` : '16px',
    };
    return (
        <input className='text-input' disabled={params.disabled} style={style} onClick={_ => params.onClick != null && params.onClick()} value={params.value} onChange={e => {
            params.update(e.target.value)
        }} placeholder={params.placeholder} onKeyUp={e => {
            if (e.key === 'Enter') {
                console.log('enter key up')
                params.save(null)
            }
        }} onBlur={_ => {
            if (params.onBlur != null) {
                params.onBlur()
            } else {
                params.save(null)
            }
        }}/>
    )
}