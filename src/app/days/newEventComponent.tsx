import {getEndpoints, post} from "@/app/lib/backend";
import {useState} from "react";
import {Day, Event, SelectedBreak} from "@/app/entity/entities";

interface DropdownOptions {
    options: string[],
    _options: string[],
    callback: (value: string) => void
    closeTimeoutId: NodeJS.Timeout|null
}

export default function NewEventComponent(props: {selectedDay: Day, selectedBreak: SelectedBreak, requestBreakObjectRefresh: () => void}) {
    const {selectedDay, selectedBreak, requestBreakObjectRefresh} = props

    const emptyEvent = {
        id: "",
        customer: "",
        price: 0,
        team: "",
        is_giveaway: false,
        note: "",
        quantity: 0
    };
    const [newEvent, _setNewEvent] = useState<{event: Event}>({event: {...emptyEvent}})

    function getNewEvent() {
        return newEvent.event
    }

    function setNewEvent(event: Event) {
        _setNewEvent({event: event})
    }

    function resetNewEvent() {
        _setNewEvent({event: {...emptyEvent}})
    }

    const [updatedEvent, _setUpdatedEvent] = useState<Event>({...emptyEvent} )

    function setUpdatedEvent(event: Event) {
        let newEvent = {...updatedEvent}
        _setUpdatedEvent(newEvent)
    }

    function resetUpdatedEvent() {
        _setUpdatedEvent({...emptyEvent})
    } const emptyDropdownOptions = {options: [], _options: [], callback: (value: string) => {}, closeTimeoutId: null}
    const [dropdownOptions, _setDropdownOptions] = useState<DropdownOptions>({...emptyDropdownOptions})

    function getFilteredDropdownOptions(oldOptions: DropdownOptions, value: string) {
        var newOptions = {...oldOptions}
        if (value === "") {
            newOptions.options = newOptions._options
        } else {
            newOptions.options = newOptions._options.filter((e) => e.indexOf(value) !== -1)
        }

        return newOptions
    }

    function setAndFilterDropdownOptions(options: string[], callback: (value: string) => void, filterValue: string) {
        if (dropdownOptions.closeTimeoutId) {
            clearTimeout(dropdownOptions.closeTimeoutId)
        }
        let newOptions = {
            options: options,
            _options: options,
            callback: callback,
            closeTimeoutId: null
        }
        _setDropdownOptions(newOptions)
    }

    function clearDropdownOptions() {
        dropdownOptions.closeTimeoutId = setTimeout(() => {
            _setDropdownOptions({...emptyDropdownOptions})
        }, 100)
        _setDropdownOptions({...dropdownOptions})
    }

    function filterDropdownOptions(value: string) {
        let newOptions = getFilteredDropdownOptions(dropdownOptions, value)
        _setDropdownOptions(newOptions)
    }

    function getUsernamesList() {
        const element = document.getElementById('username-list') as HTMLTextAreaElement
        return element?.value.split('\n');
    }

    function getTeamList() {
        const element = document.getElementById('team-list') as HTMLTextAreaElement
        return element?.value.split('\n');
    }

    return <div className="container">
        <div className="row">
            <input className="col" type="text" key= "customer" title="Customer" value={getNewEvent().customer} placeholder="Customer" onInput={e => {
                const newEvent = getNewEvent()
                newEvent.customer = e.currentTarget.value
                setNewEvent(newEvent)
                filterDropdownOptions(updatedEvent.customer)
            }} onClick={
                () => {
                    setAndFilterDropdownOptions(
                        getUsernamesList(),
                        (e: string) => {
                            updatedEvent.customer = e
                            setUpdatedEvent(updatedEvent)
                        },
                        updatedEvent.customer
                    )
                }
            } onBlur={
                () => {
                    clearDropdownOptions()
                }
            }/>
            <input className="col" type="text" key= "team" value={getNewEvent().team}  title="Team" placeholder="Team" onInput={e => {
                const newEvent = getNewEvent()
                newEvent.team = e.currentTarget.value
                setNewEvent(newEvent)
                filterDropdownOptions(updatedEvent.team)
            }} onClick={
                () => {
                    setAndFilterDropdownOptions(
                        getTeamList(),
                        (e) => {
                            updatedEvent.team = e
                            setUpdatedEvent(updatedEvent)
                        },
                        updatedEvent.team
                    )
                }
            } onBlur={
                () => {
                    clearDropdownOptions()
                }
            }/>
        </div>
        <div className="d-flex flex-wrap gap-1">
            {
                dropdownOptions.options.map((option, i, arr) => {
                    return <div key={i} className="bg-secondary" onClick={e => dropdownOptions.callback(e.currentTarget.innerText)}>{option}</div>
                })
            }
        </div>
        <div className="row">
            <input className="col-6" type="text" key= "note" value={getNewEvent().note}  title="Note" placeholder="Note" onInput={e => {
                const newEvent = getNewEvent()
                newEvent.note = e.currentTarget.value
                setNewEvent(newEvent)
            }}/>
            <input className="col" type="string" key= "price" value={"$" + getNewEvent().price.toString()}  title="Price" placeholder="Price" onInput={e => {
                let value = e.currentTarget.value.split('$')[1];
                var newPrice = parseFloat(value)
                if (isNaN(newPrice) || newPrice < 0) {
                    newPrice = 0
                }
                const newEvent = getNewEvent()
                newEvent.price = newPrice
                setNewEvent(newEvent)
            }}/>
            <input className="col" type="number" key= "quantity" value={getNewEvent().quantity}  title="Quantity" placeholder="Quantity" onInput={e => {
                var newValue = parseInt(e.currentTarget.value, 10)
                if (newValue < 0) {
                    newValue = 0
                }
                const newEvent = getNewEvent()
                newEvent.quantity = newValue
                setNewEvent(newEvent)
            }}/>
        </div>
        <div className="row justify-content-between">
            <input className="btn-check" type="checkbox" key="isGiveaway" checked={getNewEvent().is_giveaway} id={"isgwForNew"} placeholder="Note " onChange={e => {
                const newEvent = getNewEvent()
                newEvent.is_giveaway = !newEvent.is_giveaway
                setNewEvent(newEvent)
            }}/>
            <label className="col-6 btn btn-outline-primary" key="label" htmlFor={"isgwForNew"}>Is Giveaway?</label>
            <button type="button" id="add-btn" className="col-3 btn btn-primary" onClick={async e => {
                const body = {
                    year: selectedDay?.date.year,
                    month: selectedDay?.date.month,
                    day: selectedDay?.date.day,
                    name: selectedBreak,
                    ...getNewEvent(),
                }
                const data = await post((await getEndpoints()).addBreakEvent, body)
                if (!data.error) {
                    requestBreakObjectRefresh()
                    resetNewEvent()
                }
            }}>Create</button>
        </div>
    </div>
}