"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "icon";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    loading = false,
    disabled,
    children,
    className = "",
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`nook-button ${variant}-button ${className}`}
    >
      {loading && (
        <LoaderCircle className="button-spinner" size={16} aria-hidden="true" />
      )}
      <span
        className={loading ? "button-content is-loading" : "button-content"}
      >
        {children}
      </span>
    </button>
  );
});
