import {FC} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {StreamResponse} from "@/app/entity/entities";

interface TextInputProps {
    value: string
    setNewValue: (value: string) => void,
    placeholder: string,
    action: () => void
    actionLabel: string
}

export const TextInputAction: FC<TextInputProps> = (props) => {
    return <div>
        <input className='text-input' value={props.value} onChange={e => {
            props.setNewValue(e.target.value)
        }} placeholder={props.placeholder}/>
        <button type="button" id="add-Stream" className="btn bg-primary" onClick={props.action} onKeyDown={(e) => {
            if (e.key === 'Enter') {
                props.action();
            }
        }}>{props.actionLabel}</button>
    </div>
}