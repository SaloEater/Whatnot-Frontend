export default function TextInput({params} : {
    params: {
        value: string,
        update: (value: string) => void,
        save: () => void,
        max_width: number,
        font_size: number|null,
        placeholder: string
    }
}) {
    let style = {
        maxWidth: `${params.max_width}px`,
        fontSize: params.font_size ? `${params.font_size}px` : '16px',
    };
    return (
        <input style={style} value={params.value} onChange={e => {
            params.update(e.target.value)
        }} placeholder={params.placeholder} onKeyUp={e => {
            if (e.key === 'Enter') {
                console.log('enter key up')
                params.save()
            }
        }} onBlur={params.save}/>
    )
}