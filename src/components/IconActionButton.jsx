function IconActionButton({
  icon: Icon,
  iconSize = 16,
  ariaLabel,
  title,
  isActive = false,
  className = "",
  iconClassName = "",
  children,
  ...props
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel || title}
      title={title}
      className={`icon-action-button ${isActive ? "active" : ""} ${className}`.trim()}
      {...props}
    >
      {Icon ? <Icon size={iconSize} aria-hidden="true" className={iconClassName} /> : children}
    </button>
  );
}

export default IconActionButton;
