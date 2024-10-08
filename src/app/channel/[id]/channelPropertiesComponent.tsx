import React, {FC, useEffect, useState} from "react";
import {WNChannel} from "@/app/entity/entities";
import {TextInputAction} from "@/app/component/textInputAction";
import {HighBidOptions, IsNone, Teams} from "@/app/common/teams";
import {resolveVerification} from "next/dist/lib/metadata/resolvers/resolve-basics";
import {channel} from "node:diagnostics_channel";

interface ChannelPropertiesComponentProps {
    channel: WNChannel
    updateChannel(channel: WNChannel): void
}

export const ChannelPropertiesComponent: FC<ChannelPropertiesComponentProps> = (props) => {
    const [defaultFloor, setDefaultFloor] = useState(props.channel.default_high_bid_floor)
    const [defaultTeam, setDefaultTeam] = useState(props.channel.default_high_bid_team)

    useEffect(() => {
        setDefaultTeam(props.channel.default_high_bid_team)
    }, [props.channel.default_high_bid_team]);

    useEffect(() => {
        setDefaultFloor(props.channel.default_high_bid_floor)
    }, [props.channel.default_high_bid_floor]);

    useEffect(() => {
        if (defaultTeam == '' || defaultTeam == props.channel.default_high_bid_team) {
            return
        }
        let updatedChannel = {...props.channel}
        updatedChannel.default_high_bid_team = defaultTeam
        props.updateChannel(updatedChannel)
    }, [defaultTeam]);

    function updateHighBidTeam(team: string) {
        if (team == "None") {
            team = ''
        }
        setDefaultTeam(team)
    }

    function updateChannelWithFloor() {
        if (defaultFloor == props.channel.default_high_bid_floor) {
            return
        }
        let updatedChannel = {...props.channel}
        updatedChannel.default_high_bid_floor = defaultFloor
        props.updateChannel(updatedChannel)
    }

    function setDefaultFloorString(newValue: string) {
        let newNumber = parseInt(newValue)
        if (isNaN(newNumber)) {
            newNumber = props.channel.default_high_bid_floor
        }
        setDefaultFloor(newNumber)
    }

    function getDefaultFloor() {
        let floor = defaultFloor
        if (!floor) {
            return ""
        }
        return floor.toString();
    }

    return (
        <div>
            <span>
                <div>High Bid Floor:</div>
                <TextInputAction
                    value={getDefaultFloor()}
                    setNewValue={setDefaultFloorString}
                    placeholder={'Enter default floor...'}
                    action={updateChannelWithFloor} actionLabel={'Set'}
                />
            </span>
            <span>
                <div>High Bid Team:</div>
                <div className="dropdown">
                    <button className="btn btn-secondary dropdown-toggle" type="button" id="dropdownMenuButton1"
                            data-bs-auto-close="true" data-bs-toggle="dropdown" aria-expanded="false">
                        {defaultTeam == '' ? 'Select' : defaultTeam}
                    </button>
                    <ul className="dropdown-menu cursor-pointer" aria-labelledby="dropdownMenuButton1">
                        {
                            HighBidOptions.map(i => <li key={i} onClick={_ => updateHighBidTeam(i)}
                                               className={`dropdown-item ${IsNone(defaultTeam) == i ? 'active' : ''}`}>{i}</li>)
                        }
                    </ul>
                </div>
            </span>
        </div>
    )
}