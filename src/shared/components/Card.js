"use client";

import { cn } from "@/shared/utils/cn";

export default function Card({
  children,
  title,
  subtitle,
  icon,
  action,
  padding = "md",
  hover = false,
  elev = false,
  className,
  ...props
}) {
  const paddings = {
    none: "",
    xs: "p-3",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  return (
    <div
      className={cn(
        "relative",
        elev ? "card-elev rounded-2xl hud-frame" : "liquid-glass-card rounded-2xl hud-frame",
        hover &&
          "hover:shadow-[0_10px_28px_-8px_rgba(6,182,212,0.28)] hover:border-cyan-500/45 dark:hover:border-cyan-400/45 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer",
        paddings[padding],
        className
      )}
      {...props}
    >
      {/* Subtle HUD corner ticks */}
      <span
        className="pointer-events-none absolute top-1.5 left-1.5 size-2 border-t border-l border-cyan-500/30 rounded-tl-[2px]"
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute bottom-1.5 right-1.5 size-2 border-b border-r border-cyan-500/30 rounded-br-[2px]"
        aria-hidden="true"
      />

      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 shrink-0">
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="text-text-main font-semibold tracking-tight truncate">{title}</h3>
              )}
              {subtitle && (
                <p className="text-sm text-text-muted">{subtitle}</p>
              )}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

Card.Section = function CardSection({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "p-4 rounded-xl liquid-glass-panel border border-border-subtle",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.Row = function CardRow({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "p-3 -mx-3 px-3 transition-colors",
        "border-b border-border-subtle last:border-b-0",
        "hover:bg-cyan-500/[0.04]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.ListItem = function CardListItem({
  children,
  actions,
  className,
  ...props
}) {
  return (
    <div
      className={cn(
        "group flex items-center justify-between p-3 -mx-3 px-3",
        "border-b border-border-subtle last:border-b-0",
        "hover:bg-cyan-500/[0.04] transition-colors",
        className
      )}
      {...props}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {actions && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  );
};
