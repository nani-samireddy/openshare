import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: ReactNode;
};

const variants = {
  primary: "border-2 border-ink bg-sun text-ink shadow-sketch hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#26304f] focus-visible:outline-cream",
  secondary: "border-2 border-ink bg-cream text-ink shadow-[4px_4px_0_#26304f] hover:-translate-y-0.5 hover:bg-white focus-visible:outline-cream",
  danger: "border-2 border-ink bg-coral text-ink shadow-[4px_4px_0_#26304f] hover:-translate-y-0.5 hover:bg-[#ff846f] focus-visible:outline-cream",
  ghost: "border-2 border-ink bg-transparent text-ink hover:bg-cream focus-visible:outline-cream"
};

export function Button({ variant = "primary", icon, children, className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${variants[variant]} ${className}`}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
