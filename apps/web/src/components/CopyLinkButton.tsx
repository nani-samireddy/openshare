import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "./Button";

type CopyLinkButtonProps = {
  url: string;
};

export function CopyLinkButton({ url }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={handleCopy}
      icon={copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
    >
      {copied ? "Copied" : "Copy invite link"}
    </Button>
  );
}
