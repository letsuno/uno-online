export type IconName =
  'dashboard' | 'users' | 'rooms' | 'ai' | 'refresh' | 'search' | 'logout' | 'server' | 'activity' | 'key' | 'shield';

interface IconProps {
  name: IconName;
  className?: string;
}

export function Icon({ name, className = 'h-5 w-5' }: IconProps) {
  const paths: Record<IconName, React.ReactNode> = {
    dashboard: <path d="M4 4h6v6H4V4Zm10 0h6v10h-6V4ZM4 14h6v6H4v-6Zm10 4h6v2h-6v-2Z" />,
    users: (
      <>
        <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.5a3.5 3.5 0 0 1 0 7M17.5 15.2A5.5 5.5 0 0 1 22 20" />
      </>
    ),
    rooms: (
      <>
        <path d="M4 5.5 12 2l8 3.5v13L12 22l-8-3.5v-13Z" />
        <path d="M4 5.5 12 9l8-3.5M12 9v13" />
      </>
    ),
    ai: (
      <>
        <rect x="4" y="6" width="16" height="13" rx="3" />
        <path d="M9 2v4m6-4v4M8.5 12h.01m6.99 0h.01M9 16h6" />
      </>
    ),
    refresh: <path d="M20 6v5h-5M4 18v-5h5m9.5-3A7 7 0 0 0 6.2 6.2L4 11m16 2-2.2 4.8A7 7 0 0 1 5.5 14" />,
    search: <path d="m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />,
    logout: <path d="M14 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3m-4-4h11m-3-3 3 3-3 3" />,
    server: (
      <>
        <rect x="3" y="3" width="18" height="7" rx="2" />
        <rect x="3" y="14" width="18" height="7" rx="2" />
        <path d="M7 6.5h.01M7 17.5h.01M11 6.5h7M11 17.5h7" />
      </>
    ),
    activity: <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />,
    key: <path d="M15 7a5 5 0 1 0-4.5 5L13 14.5V17h2.5v2.5H19V16l-5-5" />,
    shield: <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Zm-3-10 2 2 4-4" />,
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill={name === 'dashboard' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
