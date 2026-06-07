type TrustBadgeProps = {
  className?: string;
  light?: boolean;
};

export function TrustBadge({ className = "", light = false }: TrustBadgeProps) {
  const textCls = light ? "text-slate-500" : "text-blue-400";
  const iconCls = light ? "#64748B" : "#60a5fa";

  const items = [
    {
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={iconCls} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
      label: "256-bit TLS Encryption",
    },
    {
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={iconCls} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      ),
      label: "Stripe PCI DSS Level 1",
    },
    {
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={iconCls} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      label: "Secured by Stride",
    },
  ];

  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 ${className}`}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {item.icon}
          <span className={`text-xs font-medium ${textCls}`}>{item.label}</span>
        </span>
      ))}
    </div>
  );
}
