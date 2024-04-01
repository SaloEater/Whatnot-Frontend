import {getEndpoints, post} from "@/app/lib/backend";
import {Break, Day, Event, SelectedBreak} from "@/app/entity/entities";
import {useEffect, useState} from "react";
import {Simulate} from "react-dom/test-utils";
import drop = Simulate.drop;
import {findDOMNode} from "react-dom";

interface DropdownOptions {
    options: string[],
    _options: string[],
    callback: (value: string) => void
    closeTimeoutId: NodeJS.Timeout|null
}

interface UpdatedEvent extends Event {
    isChanged: boolean
}

export default function EventComponent(props: {id: string, reversedIndex: number, normalIndex: number, isLastElement: boolean, isFirstElement: boolean, selectedDay: Day, selectedBreak: SelectedBreak, requestBreakObjectRefresh: () => void, event: Event}) {
    const {
        id, reversedIndex, normalIndex, isLastElement, isFirstElement, selectedDay, selectedBreak, requestBreakObjectRefresh, event
    } = props
    const defaultUpdatedEvent = {isChanged: false, ...event}
    const [updatedEvent, _setUpdatedEvent] = useState<UpdatedEvent>({...defaultUpdatedEvent} )

    useEffect(() => {
        _setUpdatedEvent({...defaultUpdatedEvent})
    }, [event]);

    const emptyDropdownOptions = {options: [], _options: [], callback: (value: string) => {}, closeTimeoutId: null}
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

    function setUpdatedEvent(event: UpdatedEvent) {
        let newEvent = {...updatedEvent}
        newEvent.isChanged = true
        _setUpdatedEvent(newEvent)
    }

    function resetUpdatedEvent() {
        _setUpdatedEvent({...defaultUpdatedEvent})
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
            <div className="col">Event {normalIndex + 1}</div>
            <div className="col">
                {
                    !isLastElement && <div className="d-inline" onClick={async e => {
                        const body = {
                            year: selectedDay.date.year,
                            month: selectedDay.date.month,
                            day: selectedDay.date.day,
                            name: selectedBreak,
                            id: id,
                            new_index: (normalIndex + 1)
                        }
                        const data = await post((await getEndpoints()).moveBreakEvent, body)
                        if (!data.error) {
                            requestBreakObjectRefresh()
                        }
                    }}>Up</div>
                }
                {
                    !isFirstElement && <div className="d-inline ms-2" onClick={async e => {
                        const body = {
                            year: selectedDay.date.year,
                            month: selectedDay.date.month,
                            day: selectedDay.date.day,
                            name: selectedBreak,
                            id: id,
                            new_index: normalIndex - 1
                        }
                        const data = await post((await getEndpoints()).moveBreakEvent, body)
                        if (!data.error) {
                            requestBreakObjectRefresh()
                        }
                    }}>
                        Down
                    </div>
                }
            </div>
            <div className="col-2">
                <img src="/images/bin_static_sm.png" className="img-fluid" alt="" onClick={
                    async e => {
                        const body = {
                            year: selectedDay.date.year,
                            month: selectedDay.date.month,
                            day: selectedDay.date.day,
                            name: selectedBreak,
                            id: id
                        };
                        const response = await post((await getEndpoints()).deleteBreakEvent, body);
                        if (response.error === undefined) {
                            requestBreakObjectRefresh()
                            return true
                        }
                        return false
                    }
                }/>
            </div>
        </div>
        <div className="row">
            <input className="col" type="text" key= "customer" title="Customer" value={updatedEvent.customer} placeholder="Customer" onInput={e => {
                updatedEvent.customer = e.currentTarget.value
                setUpdatedEvent(updatedEvent)
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
            <input className="col" type="text" key= "team" value={updatedEvent.team}  title="Team" placeholder="Team" onInput={e => {
                updatedEvent.team = e.currentTarget.value
                setUpdatedEvent(updatedEvent)
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
            <input className="col-6" type="text" key= "note" value={updatedEvent.note}  title="Note" placeholder="Note" onInput={e => {
                updatedEvent.note = e.currentTarget.value
                setUpdatedEvent(updatedEvent)
            }}/>
            <input className="col" type="string" key= "price" value={"$" + updatedEvent.price.toString()}  title="Price" placeholder="Price" onInput={e => {
                let value = e.currentTarget.value.split('$')[1];
                var newPrice = parseFloat(value)
                if (isNaN(newPrice) || newPrice < 0) {
                    newPrice = 0
                }
                updatedEvent.price = newPrice
                setUpdatedEvent(updatedEvent)
            }}/>
            <input className="col" type="number" key= "quantity" value={updatedEvent.quantity}  title="Quantity" placeholder="Quantity" onInput={e => {
                var newValue = parseInt(e.currentTarget.value, 10)
                if (newValue < 0) {
                    newValue = 0
                }
                updatedEvent.quantity = newValue
                setUpdatedEvent(updatedEvent)
            }}/>
        </div>
        <div className="row justify-content-between">
            <input className="btn-check" type="checkbox" key="isGiveaway" checked={updatedEvent.is_giveaway} id={"isgwFor" + id} placeholder="Note " onChange={e => {
                updatedEvent.is_giveaway = !updatedEvent.is_giveaway
                setUpdatedEvent(updatedEvent)
            }}/>
            <label className="col-6 btn btn-outline-primary" key="label" htmlFor={"isgwFor" + id}>Is Giveaway?</label>
            <button type="button" id="add-btn" className="col-3 btn btn-danger" disabled={!updatedEvent.isChanged} onClick={async e => {
                resetUpdatedEvent()
            }}>Reset</button>
            <button type="button" id="add-btn" className="col-3 btn btn-primary" disabled={!updatedEvent.isChanged} onClick={async e => {
                const body = {
                    year: selectedDay.date.year,
                    month: selectedDay.date.month,
                    day: selectedDay.date.day,
                    name: selectedBreak,
                    ...updatedEvent,
                }
                const data = await post((await getEndpoints()).updateBreakEvent, body)
                if (!data.error) {
                    requestBreakObjectRefresh()
                }
            }}>Update</button>
        </div>
    </div>
}