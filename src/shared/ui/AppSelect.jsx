import { Children, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getOptionLabel(children) {
  return Children.toArray(children)
    .map((child) => typeof child === 'string' || typeof child === 'number' ? String(child) : '')
    .join('')
}

function normalizeOptions(options, children) {
  if (options) {
    return options.map((option, index) => {
      if (typeof option === 'string' || typeof option === 'number') {
        return { disabled: false, label: String(option), value: String(option), key: `${option}-${index}` }
      }

      return {
        disabled: Boolean(option?.disabled),
        label: String(option?.label ?? option?.value ?? ''),
        value: String(option?.value ?? ''),
        key: String(option?.value ?? index),
      }
    })
  }

  return Children.toArray(children)
    .filter((child) => child?.type === 'option')
    .map((child, index) => {
      const label = getOptionLabel(child.props.children)
      const value = child.props.value == null ? label : String(child.props.value)
      return {
        disabled: Boolean(child.props.disabled),
        label,
        value,
        key: child.key ?? `${value || index}`,
      }
    })
}

function getNextEnabledIndex(options, startIndex, direction) {
  if (options.length === 0) return -1

  let index = startIndex
  for (let attempts = 0; attempts < options.length; attempts += 1) {
    index = (index + direction + options.length) % options.length
    if (!options[index].disabled) return index
  }

  return -1
}

export function AppSelect({ children, options, searchable = false, onChange, ...selectProps }) {
  const selectRef = useRef(null)
  const dropdownRef = useRef(null)
  const searchRef = useRef(null)
  const dropdownId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [position, setPosition] = useState(null)
  const currentValue = String(selectProps.value ?? selectProps.defaultValue ?? '')
  const normalizedOptions = useMemo(() => normalizeOptions(options, children), [options, children])
  const selectedIndex = normalizedOptions.findIndex((option) => option.value === currentValue)
  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query)
    if (!normalizedQuery) return normalizedOptions
    return normalizedOptions.filter((option) => normalizeSearchText(option.label).includes(normalizedQuery))
  }, [normalizedOptions, query])

  const updatePosition = useCallback(() => {
    const select = selectRef.current
    if (!select) return

    const rect = select.getBoundingClientRect()
    const viewportPadding = 8
    const menuWidth = Math.min(
      Math.max(rect.width, searchable ? 220 : rect.width),
      window.innerWidth - viewportPadding * 2,
    )
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - menuWidth - viewportPadding,
    )

    setPosition({
      left,
      top: rect.bottom + 6,
      width: menuWidth,
      maxHeight: Math.max(150, window.innerHeight - rect.bottom - 16),
    })
  }, [searchable])

  const closeDropdown = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setPosition(null)
  }, [])

  const openDropdown = useCallback(() => {
    if (selectProps.disabled) return
    const firstEnabled = normalizedOptions.findIndex((option) => !option.disabled)
    setActiveIndex(selectedIndex >= 0 && !normalizedOptions[selectedIndex]?.disabled ? selectedIndex : firstEnabled)
    setIsOpen(true)
    updatePosition()
  }, [normalizedOptions, selectedIndex, selectProps.disabled, updatePosition])

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      if (selectRef.current?.contains(event.target) || dropdownRef.current?.contains(event.target)) return
      closeDropdown()
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDropdown()
        selectRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [closeDropdown, isOpen, updatePosition])

  useEffect(() => {
    if (!isOpen || !searchable) return
    searchRef.current?.focus()
  }, [isOpen, searchable])

  useEffect(() => {
    if (!isOpen || !dropdownRef.current || !position) return
    const menu = dropdownRef.current.getBoundingClientRect()
    const select = selectRef.current?.getBoundingClientRect()
    if (!select) return

    const top = select.top - menu.height - 6
    if (menu.bottom > window.innerHeight - 8 && top >= 8 && position.top !== top) {
      setPosition((current) => current ? { ...current, top, maxHeight: Math.max(150, select.top - 16) } : current)
    }
  }, [isOpen, position])

  function selectOption(option) {
    if (option.disabled) return
    onChange?.({ target: { name: selectProps.name, value: option.value } })
    closeDropdown()
    selectRef.current?.focus()
  }

  function moveActive(direction) {
    const visibleIndex = activeIndex >= 0
      ? filteredOptions.findIndex((option) => option.value === normalizedOptions[activeIndex]?.value)
      : -1
    const nextVisibleIndex = getNextEnabledIndex(filteredOptions, visibleIndex < 0 ? (direction > 0 ? -1 : 0) : visibleIndex, direction)
    if (nextVisibleIndex < 0) return
    const nextOption = filteredOptions[nextVisibleIndex]
    setActiveIndex(normalizedOptions.findIndex((option) => option.value === nextOption.value))
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) openDropdown()
      else moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }

    if ((event.key === 'Enter' || event.key === ' ') && !isOpen) {
      event.preventDefault()
      openDropdown()
      return
    }

    if ((event.key === 'Enter' || event.key === ' ') && isOpen) {
      event.preventDefault()
      const option = normalizedOptions[activeIndex]
      if (option) selectOption(option)
      return
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      closeDropdown()
    }
  }

  function handleSearchChange(value) {
    const normalizedQuery = normalizeSearchText(value)
    const firstVisibleIndex = normalizedOptions.findIndex((option) => (
      !option.disabled && (!normalizedQuery || normalizeSearchText(option.label).includes(normalizedQuery))
    ))
    setQuery(value)
    setActiveIndex(firstVisibleIndex)
  }

  const menu = isOpen && position && typeof document !== 'undefined' ? createPortal(
    <div
      className="app-select-dropdown"
      id={dropdownId}
      ref={dropdownRef}
      role="presentation"
      style={position}
    >
      {searchable && (
        <label className="app-select-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            aria-label="Procurar"
            onChange={(event) => handleSearchChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Procurar"
            type="search"
            value={query}
          />
        </label>
      )}
      <div className="app-select-options" role="listbox" aria-label="Opções">
        {filteredOptions.map((option) => {
          const optionIndex = normalizedOptions.findIndex((item) => item.value === option.value)
          const isSelected = option.value === currentValue
          const isActive = optionIndex === activeIndex
          return (
            <button
              aria-selected={isSelected}
              className={`app-select-option${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}`}
              disabled={option.disabled}
              key={option.key}
              onClick={() => selectOption(option)}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
              {isSelected && <span aria-hidden="true">✓</span>}
            </button>
          )
        })}
        {filteredOptions.length === 0 && <span className="app-select-empty">Nenhuma opção encontrada.</span>}
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <select
        {...selectProps}
        aria-controls={isOpen ? dropdownId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onChange={onChange}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => {
          if (selectProps.disabled) return
          event.preventDefault()
          selectRef.current?.focus()
          if (isOpen) closeDropdown()
          else openDropdown()
        }}
        ref={selectRef}
        value={selectProps.value}
      >
        {options
          ? normalizedOptions.map((option) => <option disabled={option.disabled} key={option.key} value={option.value}>{option.label}</option>)
          : children}
      </select>
      {menu}
    </>
  )
}
