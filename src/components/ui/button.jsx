import { forwardRef } from "react";

function cn(...inputs) {
  return inputs.filter(Boolean).join(" ");
}

const Button = forwardRef(function Button(
  { className = "", variant = "default", size = "default", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)}
      {...props}
    />
  );
});

export { Button };
