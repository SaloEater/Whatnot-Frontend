import {Event} from "@/app/entity/entities";
import React, {FC} from "react";
import './eventComponent.css'

interface AddNewCardProps {
    addNewCard: (event: Event) => void
}

const NEW_CARD_TYPE_MISCELLANEOUS = 1
export const TYPE_NAMES: Record<number, string> = {
    [NEW_CARD_TYPE_MISCELLANEOUS]: 'Miscellaneous',
}

const AVAILABLE_TYPES = [NEW_CARD_TYPE_MISCELLANEOUS]

export const AddNewCardComponent: FC<AddNewCardProps> = (props) => {

    function createNewCard(type: number) {
        props.addNewCard({
            break_id: 0,
            customer: "",
            giveaway_type: 0,
            id: 0,
            index: 0,
            is_giveaway: false,
            note: "",
            price: 0,
            quantity: 0,
            team: TYPE_NAMES[type]
        })
    }

    return (
        <div className='w-125p position-relative border border-1 rounded rounded-3 border-primary'>
            <div className='h-100 d-flex justify-content-center align-items-center'>
                <div className="dropdown p-2">
                    <button className="btn btn-primary dropdown-toggle btn-lg" type="button"
                            data-bs-auto-close="true" data-bs-toggle="dropdown"
                            aria-expanded="false">
                        Add
                    </button>
                    <ul className="dropdown-menu cursor-pointer">
                        {
                            AVAILABLE_TYPES.map(type => (
                                <li key={type}
                                    onClick={() => createNewCard(type)}
                                    className='dropdown-item'>
                                    Add {TYPE_NAMES[type]}
                                </li>
                            ))
                        }
                    </ul>
                </div>
            </div>
        </div>
    )
}
