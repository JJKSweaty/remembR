interface ProgressRingProps {
  taken: number;
  total: number;
  size?: number;
  strokeWidth?: number;
}

export default function ProgressRing({ taken, total, size = 80, strokeWidth = 5 }: ProgressRingProps) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total === 0 ? 0 : taken / total;
  const offset = circumference - progress * circumference;
  const allDone = total > 0 && taken === total;

  return (
    <svg
      width={size}
      height={size}
      style={{ transform: "rotate(-90deg)", display: "block" }}
      aria-label={`${taken} of ${total} medications taken`}
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(200,160,100,0.12)"
        strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={allDone ? "#a8c8a0" : "#c87840"}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
      />
    </svg>
  );
}
