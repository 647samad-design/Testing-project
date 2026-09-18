interface BallotLensMarkProps {
  className?: string;
  size?: number;
}

/**
 * The BallotLens brand mark: a magnifying lens (the platform's core idea —
 * looking closely at your ballot) with a checkmark inside (a verified vote/
 * fact). Replaces the generic lucide "Scale" icon that was previously used
 * as a placeholder logo everywhere, and matches public/favicon.svg exactly
 * so the browser tab icon and the in-app logo are the same mark.
 */
export function BallotLensMark({ className = '', size = 20 }: BallotLensMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="BallotLens"
    >
      <circle cx="13.5" cy="13" r="6.5" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M10.2 13.3L12.6 15.7L17.3 10"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="18.3" y1="17.8" x2="23.5" y2="23" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
