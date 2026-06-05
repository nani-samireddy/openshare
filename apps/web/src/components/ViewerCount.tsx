import { Users } from "lucide-react";

type ViewerCountProps = {
  count: number;
};

export function ViewerCount({ count }: ViewerCountProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-sun px-3 py-1 text-xs font-extrabold text-ink">
      <Users aria-hidden className="h-4 w-4 stroke-[3]" />
      {count} {count === 1 ? "viewer" : "viewers"}
    </span>
  );
}
