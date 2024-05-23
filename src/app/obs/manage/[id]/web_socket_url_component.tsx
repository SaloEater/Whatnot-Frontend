import {FC, useEffect, useState} from "react";
import {TextInput} from "@/app/common/textInput";

interface WebSocketUrlProps {
    url: string,
    setUrl: (value: string) => void,
}

export const WebSocketUrlComponent: FC<WebSocketUrlProps> = (props) => {
    const [url, setUrl] = useState(props.url)

    useEffect(() => {
        setUrl(props.url)
    }, [props.url]);

    return <div>
        <div>
            Enter an URL:
            <TextInput font_size={null} value={url} update={setUrl} save={_ => props.setUrl(url)} placeholder={'Enter the WS URL'} onClick={null} onBlur={null} disabled={false}/>
        </div>
    </div>
}