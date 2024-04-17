import './textInput.css'

export default function TextInput({params} : {
    params: {
        value: string,
        update: (value: string) => void,
        save: () => void,
        max_width: number,
        font_size: number|null,
        placeholder: string,
        onClick: (() => void) | null,
        onBlur: (() => void) | null,
    }
}) {
    let style = {
        //maxWidth: `${params.max_width}px`,
        fontSize: params.font_size ? `${params.font_size}px` : '16px',
    };
    return (
        <input className='text-input' style={style} onClick={_ => params.onClick != null && params.onClick()} value={params.value} onChange={e => {
            params.update(e.target.value)
        }} placeholder={params.placeholder} onKeyUp={e => {
            if (e.key === 'Enter') {
                console.log('enter key up')
                params.save()
            }
        }} onBlur={_ => {
            params.save()
            if (params.onBlur != null) {
                params.onBlur()
            }
        }}/>
    )
}