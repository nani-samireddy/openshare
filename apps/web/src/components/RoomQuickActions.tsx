import { Check, Copy, LogOut, MonitorUp, Square } from "lucide-react";
import { useState } from "react";

type RoomQuickActionsProps = {
  inviteUrl: string;
  isHost: boolean;
  isSharing: boolean;
  isStarting: boolean;
  canShare: boolean;
  onStart: () => void;
  onStop: () => void;
  onLeave: () => void;
};

export function RoomQuickActions({
  inviteUrl,
  isHost,
  isSharing,
  isStarting,
  canShare,
  onStart,
  onStop,
  onLeave
}: RoomQuickActionsProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const buttonClass =
    "inline-flex h-11 w-full items-center justify-center rounded-md border-2 border-ink text-ink transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-45";

  return (
    <div className={`grid gap-2 ${isHost ? "grid-cols-4" : "grid-cols-2"}`}>
      <button
        type="button"
        aria-label={copied ? "Invite link copied" : "Copy invite link"}
        title={copied ? "Invite link copied" : "Copy invite link"}
        onClick={handleCopy}
        className={`${buttonClass} bg-cream`}
      >
        {copied ? <Check aria-hidden className="h-5 w-5" /> : <Copy aria-hidden className="h-5 w-5" />}
      </button>
      {isHost ? (
        <>
          <button
            type="button"
            aria-label={isStarting ? "Starting screen share" : "Start sharing"}
            title={isStarting ? "Starting screen share" : "Start sharing"}
            disabled={isSharing || isStarting || !canShare}
            onClick={onStart}
            className={`${buttonClass} bg-sun`}
          >
            <MonitorUp aria-hidden className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Stop sharing"
            title="Stop sharing"
            disabled={!isSharing}
            onClick={onStop}
            className={`${buttonClass} bg-coral`}
          >
            <Square aria-hidden className="h-5 w-5" />
          </button>
        </>
      ) : null}
      <button type="button" aria-label="Leave room" title="Leave room" onClick={onLeave} className={`${buttonClass} bg-white`}>
        <LogOut aria-hidden className="h-5 w-5" />
      </button>
    </div>
  );
}
