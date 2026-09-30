/** Product mark: angle brackets around a slash — XML, cut by a signal. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-deep ${className ?? "h-8 w-8"}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[58%] w-[58%]">
        <path
          d="M8.5 6 5 12l3.5 6M15.5 6l3.5 6-3.5 6"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M13.2 7.2 10.8 16.8" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
