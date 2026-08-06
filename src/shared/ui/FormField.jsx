export function FormField({ children, className = '', error, hint, label, required = false }) {
  return (
    <label className={`ui-form-field ${className}`.trim()}>
      <span className="ui-form-field__label">{label}{required && <span aria-hidden="true"> *</span>}</span>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <strong role="alert">{error}</strong>}
    </label>
  )
}

export function TextField({ error, hint, label, required, ...inputProps }) {
  return <FormField error={error} hint={hint} label={label} required={required}><input {...inputProps} required={required} /></FormField>
}

export function SelectField({ children, error, hint, label, required, ...selectProps }) {
  return <FormField error={error} hint={hint} label={label} required={required}><select {...selectProps} required={required}>{children}</select></FormField>
}

export function TextAreaField({ error, hint, label, required, ...textareaProps }) {
  return <FormField error={error} hint={hint} label={label} required={required}><textarea {...textareaProps} required={required} /></FormField>
}
