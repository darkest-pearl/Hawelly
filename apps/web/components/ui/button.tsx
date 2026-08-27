import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "small" | "medium" | "large";
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  size = "medium",
  fullWidth = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    "button",
    `button-${variant}`,
    `button-${size}`,
    fullWidth ? "button-full" : "",
    className
  ].filter(Boolean).join(" ");
  return <button className={classes} type={type} {...props} />;
}
