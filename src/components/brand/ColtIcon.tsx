// COLT app icon — the red "C" on an Ink rounded-square tile. Used for the
// favicon/app-icon/PWA marks. Pass a `className` to size it.
export function ColtIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="COLT"
      className={className}
    >
      <rect width="200" height="200" rx="46" fill="#0B0B0C" />
      <g transform="translate(74,35) scale(1.083)">
        <path
          d="M43.66 17.6 A22 50 0 1 0 43.66 102.4"
          fill="none"
          stroke="#FF2E1F"
          strokeWidth="20"
        />
      </g>
    </svg>
  );
}
