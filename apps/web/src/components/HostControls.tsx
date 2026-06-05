import { MonitorUp, Square } from "lucide-react";
import { Button } from "./Button";

type HostControlsProps = {
  isSharing: boolean;
  isStarting: boolean;
  canShare: boolean;
  onStart: () => void;
  onStop: () => void;
};

export function HostControls({ isSharing, isStarting, canShare, onStart, onStop }: HostControlsProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        type="button"
        onClick={onStart}
        disabled={isSharing || isStarting || !canShare}
        icon={<MonitorUp aria-hidden className="h-4 w-4" />}
      >
        {isStarting ? "Starting..." : "Start sharing"}
      </Button>
      <Button
        type="button"
        variant="danger"
        onClick={onStop}
        disabled={!isSharing}
        icon={<Square aria-hidden className="h-4 w-4" />}
      >
        Stop sharing
      </Button>
    </div>
  );
}
