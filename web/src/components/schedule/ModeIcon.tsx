import { Drama, type LucideProps } from "lucide-react";
import { categoryOfMode } from "@/lib/scheduleOptions";

/**
 * A game's mode as an icon: masks for Roleplay, a tank for Historical. Lucide
 * has no tank, so it's drawn here in the same 24px, 2px-stroke style.
 */
export function TankIcon({ className, strokeWidth = 2, ...rest }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <rect x="2" y="14" width="20" height="6" rx="3" />
      <path d="M5 14v-2h14v2" />
      <path d="M8 12V9.5A1.5 1.5 0 0 1 9.5 8h4A1.5 1.5 0 0 1 15 9.5V12" />
      <path d="M15 10h7" />
    </svg>
  );
}

export default function ModeIcon({ mode, ...props }: LucideProps & { mode: string }) {
  const Icon = categoryOfMode(mode) === "Historical" ? TankIcon : Drama;
  return <Icon aria-hidden {...props} />;
}
