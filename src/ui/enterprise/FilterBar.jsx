import clsx from "clsx";

export default function FilterBar({ children, collapsedLabel, className = "" }) {
  return (
    <div className={clsx("flex w-full flex-wrap items-center gap-2 md:w-auto", className)} data-mobile-label={collapsedLabel}>
      {children}
    </div>
  );
}
