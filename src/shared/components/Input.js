"use client";

import { cn } from "@/shared/utils/cn";

export default function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  hint,
  icon,
  disabled = false,
  required = false,
  className,
  inputClassName,
  ...props
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={props.id} className="text-sm font-medium text-text-main">
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
          </div>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "w-full py-2 px-3 text-sm text-text-main bg-surface/90 rounded-lg",
            "border border-border placeholder-text-subtle",
            "hover:border-cyan-500/35",
            "focus:outline-none focus:ring-2 focus:ring-cyan-500/25 focus:border-cyan-500 focus:shadow-[0_0_14px_-4px_rgba(6,182,212,0.35)]",
            "transition-all duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed",
            // iOS zoom fix
            "text-[16px] sm:text-sm",
            icon && "pl-10",
            error &&
              "border-rose-500 hover:border-rose-500 focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500 focus:shadow-[0_0_14px_-4px_rgba(244,63,94,0.35)]",
            inputClassName
          )}
          {...props}
        />
      </div>
      {error && (
        <p className="text-xs text-rose-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">error</span>
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-text-muted">{hint}</p>
      )}
    </div>
  );
}
