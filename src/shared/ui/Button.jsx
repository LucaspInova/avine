export function Button({ variant = 'primary', className = '', type = 'button', ...props }) {
  return <button className={`ui-button ui-button--${variant} ${className}`.trim()} type={type} {...props} />
}
