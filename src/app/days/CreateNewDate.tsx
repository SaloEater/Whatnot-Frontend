import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import moment from "moment";
import {getEndpoints, post} from "@/app/lib/backend";
import {Dispatch, SetStateAction} from "react";
import {DayDate} from "@/app/entity/entities";

export default function CreateNewDate(props: {
    newDayDate: DayDate,
    setNewDayDate: Dispatch<SetStateAction<DayDate>>
    dateTimeFormat: string,
    requestedDaysReload: boolean,
    requestDaysReload: Dispatch<SetStateAction<boolean>>
}) {
    return (
        <div>
            <TuiDateTimePicker
                key={`${props.newDayDate.year}-${props.newDayDate.month}-${props.newDayDate.day}`}
                handleChange={async e => {
                    const newDate = moment(e, props.dateTimeFormat.toUpperCase()).toDate()
                    props.setNewDayDate({year: newDate.getFullYear(), month: newDate.getMonth(), day: newDate.getDate()})
                }}
                format={props.dateTimeFormat}
                date={new Date(props.newDayDate.year, props.newDayDate.month, props.newDayDate.day)}
                inputWidth="auto"
            />
            <button type="button" id="add-day" className="btn bg-primary" onClick={
                async e => {
                    const body = {
                        year: props.newDayDate.year,
                        month: props.newDayDate.month,
                        day: props.newDayDate.day,
                    };
                    const response = await post((await getEndpoints()).addDay, body);
                    if (response.error === undefined) {
                        props.requestDaysReload(!props.requestedDaysReload);
                        return true
                    }
                    return false
                }
            }>Add</button>
        </div>
    )
}