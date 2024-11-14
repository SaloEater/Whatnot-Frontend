import SwapComponent from "@/app/break/[id]/swapComponent";
import { Event } from "@/app/entity/entities";
import { useState } from "react";

export default function ToolsComponent({
  params,
}: {
  params: {
    events: Event[];
    swapTeams: (a: Event[], b: Event[]) => void;
  };
}) {
  const [showSwap, setShowSwap] = useState(false);
  const [swapMode, setSwapMode] = useState<"standard" | "free">("standard");

  function switchSwap(mode: "standard" | "free") {
    setSwapMode(mode);
    setShowSwap(true);
  }

  return (
    <div>
      {showSwap && (
        <SwapComponent
          params={{
            swapTeams: params.swapTeams,
            events: params.events,
            swapMode,
            onClose: () => {
              setShowSwap(false);
            },
          }}
        />
      )}
      <div className="d-flex align-items-center">Tools:</div>
      <div className="d-flex justify-content-between gap-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => switchSwap("standard")}
        >
          Swap teams
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => switchSwap("free")}
        >
          Swap free teams
        </button>
      </div>
    </div>
  );
}
