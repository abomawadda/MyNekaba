import clsx from "clsx";
import { getTone } from "./utils";

const sizes = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-[11px]",
};

export default function Badge({ tone = "neutral", size = "sm", children, className = "" }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full border font-semibold leading-none whitespace-nowrap", sizes[size] || sizes.sm, getTone(tone), className)}>
      {children}
    </span>
  );
}
