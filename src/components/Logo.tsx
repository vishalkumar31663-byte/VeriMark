export function VeriMarkLogo({
  size = 28,
  showWordmark = true,
  className = '',
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M16 2.5L4.5 7.2V15.4C4.5 22.3 9.4 27.9 16 29.5C22.6 27.9 27.5 22.3 27.5 15.4V7.2L16 2.5Z"
          className="fill-indigo-600 dark:fill-indigo-500"
        />
        <path
          d="M16 4.8L6.8 8.6V15.3C6.8 20.9 10.7 25.5 16 27.1C21.3 25.5 25.2 20.9 25.2 15.3V8.6L16 4.8Z"
          className="fill-[#0F172A] dark:fill-[#0B1120]"
        />
        <path
          d="M11 16.2L14.3 19.5L21.2 12.2"
          stroke="#34D399"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11 23.2H21"
          stroke="#818CF8"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="2.5 2.5"
        />
      </svg>
      {showWordmark && (
        <span className="font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
          VeriMark
        </span>
      )}
    </span>
  );
}
