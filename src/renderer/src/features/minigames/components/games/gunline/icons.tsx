interface IconProps {
  className?: string;
}

function base(className?: string) {
  return {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconSupplies({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5z" />
      <path d="M3 8.5 12 13l9-4.5M12 13v7" />
    </svg>
  );
}

export function IconAmmo({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 3h6l2 5v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8z" />
      <path d="M7 8h10M10 12h4" />
    </svg>
  );
}

export function IconCredits({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M10 3h4l5 5v13H5V8z" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  );
}

export function IconMap({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </svg>
  );
}

export function IconWeapon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 9h13l3 3h2v3h-6l-2-2H8l-2 4H3z" />
      <path d="M8 9V6h4v3" />
    </svg>
  );
}

export function IconBarracks({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 10 12 4l9 6v10H3z" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

export function IconMissions({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M7 4h10v16H7z" />
      <path d="M10 9l1.5 1.5L15 7M10 15h4" />
    </svg>
  );
}

export function IconLock({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconSkull({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3a7 7 0 0 0-7 7v3l2 1.5V18h10v-3.5L19 13v-3a7 7 0 0 0-7-7z" />
      <path d="M9.5 10.5h.01M14.5 10.5h.01" />
    </svg>
  );
}

export function IconStar({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="m12 3 2.7 5.8 6.3.8-4.6 4.3 1.2 6.2L12 17.2 6.4 20.1l1.2-6.2L3 9.6l6.3-.8z" />
    </svg>
  );
}

export function IconFlag({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 21V4M6 4h11l-2 4 2 4H6" />
    </svg>
  );
}

export function IconInfinity({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M8.5 9a3 3 0 1 0 0 6c2.5 0 4-6 7-6a3 3 0 1 1 0 6c-3 0-4.5-6-7-6z" />
    </svg>
  );
}
