'use client'

import {createContext, useContext, useState} from "react";

type Error = {
    text: string,
    createdAt: bigint,
}

export const ErrorLogContext = createContext<Error[]>([]);

export default function ErrorLog() {
    var [errors, setErrors] = useState<Error[]>()
    errors = errors === undefined ? [] : errors


    return (
        <ErrorLogContext.Provider value={errors}>
            <ErrorLogComponent key='1'/>
        </ErrorLogContext.Provider>
    )
}

function ErrorLogComponent() {
    let errors  = useContext(ErrorLogContext)

    return (
        <div className="position-absolute top-0 end-0 d-flex gap-1 flex-column">
            {
                errors.map((i, j) => {
                    return <div key={j} className="bg-danger">
                        {i.text}
                    </div>
                })
            }
        </div>
    )
}