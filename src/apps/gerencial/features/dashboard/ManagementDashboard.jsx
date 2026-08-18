import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { calculateManagementDashboard, useManagementDashboard } from '../../../../domains/dashboard'
import { AppSelect, FilterPopover, FilterSection } from '../../../../shared/ui'
import { getGaugeTone } from './dashboardVisualUtils'
import { getDefaultPeriodDates } from './periodDateUtils'
import { formatPeriodRange } from './periodIndicatorUtils'
import './ManagementDashboard.css'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
const longDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const decimalFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function toDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function getCurrentWeekDates(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
  return { startDate: toDateInput(start), endDate: toDateInput(now) }
}

function formatNumber(value) {
  return numberFormatter.format(Number(value ?? 0))
}

function formatEggs(value) {
  return `${formatNumber(value)} ovos`
}

function formatMoney(value) {
  return moneyFormatter.format(Number(value ?? 0))
}

function formatPercent(value) {
  return `${decimalFormatter.format(Number(value ?? 0))}%`
}

function formatDate(value) {
  if (!value) return ''
  return dateFormatter.format(new Date(`${value}T00:00:00`)).replace('.', '')
}

function PeriodIndicator({ startDate, endDate, isDefaultPeriod }) {
  const periodLabel = isDefaultPeriod ? 'Período padrão' : 'Período personalizado'
  const rangeLabel = formatPeriodRange(startDate, endDate)
  return (
    <div className="management-dashboard__period-indicator" role="status" aria-live="polite" aria-label={`Visualizando: ${periodLabel} · ${rangeLabel}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17" /></svg>
      <span className="management-dashboard__period-indicator-text">
        <span className="management-dashboard__period-indicator-prefix">Visualizando:</span>
        <strong>{periodLabel}</strong>
        <span aria-hidden="true">·</span>
        <span>{rangeLabel}</span>
      </span>
    </div>
  )
}

function formatChartDate(value) {
  return formatDate(value).replace(' de ', ' ')
}

function formatLongDate(value) {
  if (!value) return ''
  return longDateFormatter.format(new Date(`${value}T00:00:00`))
}

function formatChartMoney(value) {
  const amount = Math.max(0, Number(value ?? 0))
  if (amount >= 1000) return `R$ ${formatNumber(Math.round(amount / 1000))} mil`
  return `R$ ${formatNumber(Math.round(amount))}`
}

function getPageItems(currentPage, totalPages) {
  if (totalPages <= 1) return [1]
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  const ordered = [...pages].filter((page) => page > 0 && page <= totalPages).sort((left, right) => left - right)
  return ordered.reduce((items, page, index) => {
    if (index > 0 && page - ordered[index - 1] > 1) items.push('ellipsis')
    items.push(page)
    return items
  }, [])
}

function SortIcon({ direction }) {
  if (direction === 'asc') return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m8 12.5V3.5m0 0L4.75 6.75M8 3.5l3.25 3.25" /></svg>
  if (direction === 'desc') return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="M8 3.5v9m0 0 3.25-3.25M8 12.5 4.75 9.25" /></svg>
  return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m5 5 3-3 3 3M11 11l-3 3-3-3" /></svg>
}

function SortableHeader({ column, sort, onSort }) {
  if (!column.sortValue) return <th key={column.key}>{column.label}</th>
  const direction = sort?.key === column.key ? sort.direction : undefined
  const nextDirection = direction === 'asc' ? 'decrescente' : direction === 'desc' ? 'original' : 'crescente'
  return <th key={column.key} aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}>
    <button type="button" className={'management-dashboard__sort-header' + (direction ? ' is-active' : '')} onClick={() => onSort(column.key)} aria-label={`Ordenar por ${column.label} em ordem ${nextDirection}`}>
      <span>{column.label}</span><SortIcon direction={direction} />
    </button>
  </th>
}

function compareSortValues(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left ?? '').localeCompare(String(right ?? ''), 'pt-BR', { sensitivity: 'base', numeric: true })
}

function useSortableItems(items, columns) {
  const [sort, setSort] = useState(null)
  const sortedItems = useMemo(() => {
    if (!sort) return items
    const column = columns.find((item) => item.key === sort.key)
    if (!column?.sortValue) return items
    const factor = sort.direction === 'asc' ? 1 : -1
    return items.map((item, index) => ({ item, index })).sort((left, right) => {
      const result = compareSortValues(column.sortValue(left.item), column.sortValue(right.item))
      return result === 0 ? left.index - right.index : result * factor
    }).map(({ item }) => item)
  }, [columns, items, sort])
  const toggleSort = useCallback((key) => {
    setSort((current) => current?.key !== key ? { key, direction: 'asc' } : current.direction === 'asc' ? { key, direction: 'desc' } : null)
  }, [])
  return { sort, sortedItems, toggleSort }
}

function Evolution({ value }) {
  const direction = value?.direction ?? 'neutral'
  const icon = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'
  return <span className={`management-dashboard__evolution is-${direction}`}>{icon} {formatPercent(value?.value)}</span>
}

function ReasonEvolution({ reason }) {
  if (!reason.evolutionAvailable) return <span className="management-dashboard__evolution is-neutral">—</span>
  return <Evolution value={reason.evolution} />
}

function SummaryIcon({ tone }) {
  const props = { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true, focusable: false }
  if (tone === 'total') return <svg {...props}><path fillRule="evenodd" d="M10.5 3A1.501 1.501 0 0 0 9 4.5h6A1.5 1.5 0 0 0 13.5 3h-3Zm-2.693.178A3 3 0 0 1 10.5 1.5h3a3 3 0 0 1 2.694 1.678c.497.042.992.092 1.486.15 1.497.173 2.57 1.46 2.57 2.929V19.5a3 3 0 0 1-3 3H6.75a3 3 0 0 1-3-3V6.257c0-1.47 1.073-2.756 2.57-2.93.493-.057.989-.107 1.487-.15Z" clipRule="evenodd" /></svg>
  if (tone === 'finalized') return <svg {...props}><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" /></svg>
  if (tone === 'pending') return <svg {...props}><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clipRule="evenodd" /></svg>
  if (tone === 'days') return <svg {...props}><path fillRule="evenodd" d="M7.5 2.25a.75.75 0 0 1 .75.75v1.5h7.5V3a.75.75 0 0 1 1.5 0v1.5h.75A2.25 2.25 0 0 1 20.25 6.75v11.5A2.25 2.25 0 0 1 18 20.5H6A2.25 2.25 0 0 1 3.75 18.25V6.75A2.25 2.25 0 0 1 6 4.5h.75V3a.75.75 0 0 1 .75-.75Zm-2.25 7v9a.75.75 0 0 0 .75.75h12a.75.75 0 0 0 .75-.75v-9h-13.5Zm3 2.25a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3a.75.75 0 0 1 .75-.75Zm3.75 0a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3a.75.75 0 0 1 .75-.75Zm3.75 0a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" /></svg>
  return <svg {...props}><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm11.378-3.917c-.89-.777-2.366-.777-3.255 0a.75.75 0 0 1-.988-1.129c1.454-1.272 3.776-1.272 5.23 0 1.513 1.324 1.513 3.518 0 4.842a3.75 3.75 0 0 1-.837.552c-.676.328-1.028.774-1.028 1.152v.75a.75.75 0 0 1-1.5 0v-.75c0-1.279 1.06-2.107 1.875-2.502.182-.088.351-.199.503-.331.83-.727.83-1.857 0-2.584ZM12 18a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>
}

function SummaryCard({ label, total, value, percentage, tone }) {
  return (
    <article className={`management-dashboard__summary-card is-${tone}`}>
      <div className="management-dashboard__summary-title"><SummaryIcon tone={tone} /><span>{label}</span></div>
      <div>
        <strong>{value ?? formatNumber(total)}</strong>
        {percentage !== undefined && <small>{formatPercent(percentage)}</small>}
      </div>
    </article>
  )
}

function DashboardGauge({ label, value, unavailable = false }) {
  const percentage = Math.max(0, Math.min(100, Number(value ?? 0)))
  const tone = getGaugeTone(percentage)
  const radians = (180 - (percentage * 1.8)) * (Math.PI / 180)
  const needleX = 100 + Math.cos(radians) * 57
  const needleY = 100 - Math.sin(radians) * 57

  return (
    <div className={`management-dashboard__gauge is-${tone}`}>
      <svg viewBox="0 0 200 132" role="img" aria-label={`${label}: ${unavailable ? 'dados insuficientes' : formatPercent(percentage)}`}>
        <path className="management-dashboard__gauge-zone is-danger" d="M20 100 A80 80 0 0 1 52.98 35.28" />
        <path className="management-dashboard__gauge-zone is-warning" d="M52.98 35.28 A80 80 0 0 1 147.02 35.28" />
        <path className="management-dashboard__gauge-zone is-success" d="M147.02 35.28 A80 80 0 0 1 180 100" />
        {!unavailable && <>
          <line className="management-dashboard__gauge-needle" x1="100" y1="100" x2={needleX} y2={needleY} />
          <circle className="management-dashboard__gauge-center" cx="100" cy="100" r="5" />
        </>}
        <text className="management-dashboard__gauge-limit" x="20" y="122">0</text>
        <text className="management-dashboard__gauge-limit" x="166" y="122">100</text>
      </svg>
      <strong>{unavailable ? '—' : formatPercent(percentage)}</strong>
      <span>{label}</span>
    </div>
  )
}

export function FinancialChart({ data }) {
  const [activeIndex, setActiveIndex] = useState(null)
  if (data.length === 0) return <div className="management-dashboard__chart-empty">Sem valores no período.</div>
  const width = 760
  const height = 310
  const padding = { top: 20, right: 28, bottom: 52, left: 84 }
  const max = Math.max(...data.map((point) => point.value), 1)
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const toPoint = (point, index) => {
    const x = padding.left + (data.length === 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth)
    const y = padding.top + innerHeight - (point.value / max) * innerHeight
    return { x, y }
  }
  const points = data.map(toPoint)
  const polyline = points.map(({ x, y }) => `${x},${y}`).join(' ')
  const area = `${padding.left},${padding.top + innerHeight} ${polyline} ${padding.left + innerWidth},${padding.top + innerHeight}`
  const labelCount = Math.min(data.length, data.length > 12 ? 5 : 4)
  const labelIndexes = [...new Set(Array.from({ length: labelCount }, (_, index) => Math.round((index * (data.length - 1)) / Math.max(1, labelCount - 1))))]
  const activePoint = activeIndex === null ? null : points[activeIndex]
  const activeData = activeIndex === null ? null : data[activeIndex]
  const tooltipWidth = 174
  const tooltipHeight = 54
  const tooltipX = activePoint ? Math.min(width - padding.right - tooltipWidth, Math.max(padding.left, activePoint.x - tooltipWidth / 2)) : 0
  const tooltipY = activePoint ? (activePoint.y < padding.top + tooltipHeight + 12 ? activePoint.y + 14 : activePoint.y - tooltipHeight - 12) : 0

  return (
    <svg className="management-dashboard__financial-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolução diária do valor financeiro">
      <defs><linearGradient id="management-dashboard-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#087337" stopOpacity=".62" /><stop offset="1" stopColor="#087337" stopOpacity="0" /></linearGradient></defs>
      {[0, .25, .5, .75, 1].map((step) => {
        const y = padding.top + innerHeight - step * innerHeight
        return <g key={step}>
          <line className="management-dashboard__chart-grid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
          <text className="management-dashboard__chart-y-label" textAnchor="end" x={padding.left - 14} y={y + 5}>{formatChartMoney(max * step)}</text>
        </g>
      })}
      <polygon className="management-dashboard__chart-area" points={area} />
      <polyline className="management-dashboard__chart-line" points={polyline} />
      {activePoint && <line className="management-dashboard__chart-hover-line" x1={activePoint.x} x2={activePoint.x} y1={padding.top} y2={padding.top + innerHeight} />}
      {points.map(({ x, y }, index) => <g key={data[index].date}>
        <circle
          className="management-dashboard__chart-hit-area"
          cx={x}
          cy={y}
          r="24"
          tabIndex="0"
          role="button"
          aria-label={`${formatLongDate(data[index].date)}: ${formatMoney(data[index].value)}`}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(null)}
          onClick={() => setActiveIndex(index)}
          onFocus={() => setActiveIndex(index)}
          onBlur={() => setActiveIndex(null)}
        />
        <circle className={`management-dashboard__chart-dot${activeIndex === index ? ' is-active' : ''}`} cx={x} cy={y} r={activeIndex === index ? '5.5' : '3.5'} />
      </g>)}
      {labelIndexes.map((index) => {
        const point = points[index]
        return <text className="management-dashboard__chart-x-label" textAnchor="middle" x={point.x} y={height - 14} key={data[index].date}>{formatChartDate(data[index].date)}</text>
      })}
      {activePoint && activeData && <g className="management-dashboard__chart-tooltip" aria-live="polite">
        <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="7" />
        <text x={tooltipX + 12} y={tooltipY + 21}>{formatLongDate(activeData.date)}</text>
        <text className="management-dashboard__chart-tooltip-value" x={tooltipX + 12} y={tooltipY + 41}>{formatMoney(activeData.value)}</text>
      </g>}
    </svg>
  )
}

function DashboardSkeleton() {
  return (
    <div className="management-dashboard__skeleton" aria-label="Carregando Dashboard Geral" role="status">
      {Array.from({ length: 10 }, (_, index) => <span className={`management-dashboard__skeleton-block is-${index + 1}`} key={index} />)}
    </div>
  )
}

function SourceError({ title, sourceErrors }) {
  const names = sourceErrors.map((error) => error.source).join(', ')
  return <div className="management-dashboard__source-error" role="alert"><strong>{title}</strong><span>Não foi possível carregar: {names}.</span></div>
}

function TableEmpty({ children }) {
  return <p className="management-dashboard__table-empty">{children}</p>
}

export function ManagementListModal({
  title,
  modalId,
  itemLabel,
  searchPlaceholder,
  searchLabel,
  emptyMessage,
  searchEmptyMessage,
  items = [],
  errors = [],
  errorTitle,
  columns,
  renderTotals,
  getSearchText,
  getItemKey,
  isOpen,
  onClose,
  variant = 'products',
}) {
  const modalRef = useRef(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const { sort, sortedItems, toggleSort } = useSortableItems(items, columns)
  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return term ? sortedItems.filter((item) => getSearchText(item).toLocaleLowerCase().includes(term)) : sortedItems
  }, [getSearchText, search, sortedItems])
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visibleItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => [...(modalRef.current?.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])') ?? [])].filter((element) => !element.disabled)
    const focusFirst = window.requestAnimationFrame(() => focusable()[0]?.focus())
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (elements.length === 0) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => { window.cancelAnimationFrame(focusFirst); document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handleKeyDown) }
  }, [isOpen, onClose])

  if (!isOpen) return null
  const pageItems = getPageItems(currentPage, totalPages)
  const firstItem = filteredItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const lastItem = Math.min(currentPage * pageSize, filteredItems.length)

  return <div className="management-dashboard__modal-root" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div ref={modalRef} className={'management-dashboard__products-modal is-' + variant + '-modal'} role="dialog" aria-modal="true" aria-labelledby={modalId} onMouseDown={(event) => event.stopPropagation()}>
      <header className="management-dashboard__products-modal-header"><h2 id={modalId}>{title}</h2><button type="button" className="management-dashboard__modal-close" aria-label={'Fechar ' + title.toLocaleLowerCase()} onClick={onClose}>×</button></header>
      <div className="management-dashboard__products-modal-search"><label className="management-dashboard__search-field"><span aria-hidden="true">⌕</span><input value={search} placeholder={searchPlaceholder} aria-label={searchLabel} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label></div>
      <div className="management-dashboard__products-modal-body">{errors.length > 0 ? <SourceError title={errorTitle} sourceErrors={errors} /> : visibleItems.length === 0 ? <TableEmpty>{search ? searchEmptyMessage : emptyMessage}</TableEmpty> : <div className="management-dashboard__products-modal-table-scroll"><table className="management-dashboard__products-modal-table"><thead><tr>{columns.map((column) => <SortableHeader key={column.key} column={column} sort={sort} onSort={(key) => { toggleSort(key); setPage(1) }} />)}</tr></thead><tbody>{visibleItems.map((item, index) => { const rowIndex = (currentPage - 1) * pageSize + index; return <tr key={getItemKey(item)}>{columns.map((column) => <td className={column.className?.(item, rowIndex)} key={column.key}>{column.render(item, rowIndex)}</td>)}</tr> })}</tbody>{renderTotals && <tfoot><tr>{renderTotals(filteredItems)}</tr></tfoot>}</table></div>}</div>
      <footer className="management-dashboard__products-modal-footer"><span>{firstItem}–{lastItem} de {filteredItems.length} {itemLabel}</span><nav className="management-dashboard__products-pagination" aria-label={'Paginação de ' + itemLabel}><button type="button" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button>{pageItems.map((item, index) => item === 'ellipsis' ? <span key={'ellipsis-' + index}>…</span> : <button type="button" key={item} className={item === currentPage ? 'is-active' : ''} aria-current={item === currentPage ? 'page' : undefined} onClick={() => setPage(item)}>{item}</button>)}<button type="button" aria-label="Próxima página" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(value + 1, totalPages))}>›</button></nav><label className="management-dashboard__page-size"><span>Por página</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} aria-label={itemLabel + ' por página'}><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label></footer>
    </div>
  </div>
}

export function ProductsModal({ products, errors, isOpen, onClose }) {
  return <ManagementListModal
    title="Produtos"
    modalId="products-modal-title"
    itemLabel="produtos"
    searchPlaceholder="Buscar produto..."
    searchLabel="Buscar produto"
    emptyMessage="Nenhum retorno novo com produto detalhado no período."
    searchEmptyMessage="Nenhum produto encontrado para a busca."
    items={products}
    errors={errors}
    errorTitle="Produtos indisponíveis"
    getSearchText={(product) => product.name}
    getItemKey={(product) => product.name + '-' + product.category}
    renderTotals={(filteredProducts) => {
      const totals = filteredProducts.reduce((result, product) => {
        result.billed += Number(product.billed ?? 0)
        result.returned += Number(product.returned ?? 0)
        result.reasons.set(product.mainReason, (result.reasons.get(product.mainReason) ?? 0) + Number(product.returned ?? 0))
        return result
      }, { billed: 0, returned: 0, reasons: new Map() })
      const mainReason = [...totals.reasons.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? '—'
      const returnPercentage = totals.billed > 0 ? (totals.returned / totals.billed) * 100 : 0
      return <><td className="management-dashboard__products-total-label">Total</td><td><small>Total faturado</small><strong>{formatEggs(totals.billed)}</strong></td><td><small>Total retorno</small><strong>{formatEggs(totals.returned)}</strong></td><td><small>% média de retorno</small><strong>{formatPercent(returnPercentage)}</strong></td><td><small>Motivo principal</small><strong>{mainReason}</strong></td></>
    }}
    columns={[
      { key: 'name', label: 'Produto', sortValue: (product) => product.name, render: (product) => product.name },
      { key: 'billed', label: 'Faturado', sortValue: (product) => product.billed, render: (product) => formatEggs(product.billed) },
      { key: 'returned', label: 'Retornado', sortValue: (product) => product.returned, render: (product) => formatEggs(product.returned) },
      { key: 'percentage', label: '% retorno', sortValue: (product) => product.returnPercentage, className: (product) => 'is-' + getGaugeTone(product.returnPercentage), render: (product) => formatPercent(product.returnPercentage) },
      { key: 'reason', label: 'Motivo principal', sortValue: (product) => product.mainReason, render: (product) => product.mainReason },
    ]}
    isOpen={isOpen}
    onClose={onClose}
  />
}
export function ManagementDashboard({ restrictedUfs = [] }) {
  const defaults = useMemo(() => getDefaultPeriodDates(), [])
  const currentWeek = useMemo(() => getCurrentWeekDates(), [])
  const today = currentWeek.endDate
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filters, setFilters] = useState(() => ({ ...defaults, status: '', uf: '', city: '' }))
  const [draftFilters, setDraftFilters] = useState(() => ({ ...defaults, status: '', uf: '', city: '' }))
  const [isProductsModalOpen, setIsProductsModalOpen] = useState(false)
  const [isStoresModalOpen, setIsStoresModalOpen] = useState(false)
  const [isReasonsModalOpen, setIsReasonsModalOpen] = useState(false)
  const productsTriggerRef = useRef(null)
  const storesTriggerRef = useRef(null)
  const reasonsTriggerRef = useRef(null)
  const query = useManagementDashboard(filters)
  const dashboard = useMemo(() => query.data ? calculateManagementDashboard(query.data) : null, [query.data])
  const productColumns = useMemo(() => [
    { key: 'name', label: 'Produto', sortValue: (product) => product.name },
    { key: 'billed', label: 'Faturado', sortValue: (product) => product.billed },
    { key: 'returned', label: 'Retornado', sortValue: (product) => product.returned },
    { key: 'percentage', label: '% retorno', sortValue: (product) => product.returnPercentage },
    { key: 'reason', label: 'Motivo principal', sortValue: (product) => product.mainReason },
  ], [])
  const storeColumns = useMemo(() => [
    { key: 'name', label: 'Loja', sortValue: (store) => store.name },
    { key: 'billed', label: 'Qtd. faturada', sortValue: (store) => store.billed },
    { key: 'returned', label: 'Qtd. retorno', sortValue: (store) => store.returned },
    { key: 'percentage', label: '% de retorno', sortValue: (store) => store.returnPercentage },
  ], [])
  const productTable = useSortableItems(dashboard?.products ?? [], productColumns)
  const storeTable = useSortableItems(dashboard?.stores ?? [], storeColumns)
  const availableUfs = (query.data?.current.ufs ?? []).filter((uf) => restrictedUfs.length === 0 || restrictedUfs.includes(uf))
  const cities = query.data?.current.cities ?? []
  const periodFilterCount = Number(draftFilters.startDate !== defaults.startDate || draftFilters.endDate !== defaults.endDate)
  const activePeriodFilterCount = Number(filters.startDate !== defaults.startDate || filters.endDate !== defaults.endDate)
  const activeFilterCount = activePeriodFilterCount + Number(Boolean(filters.status)) + Number(Boolean(filters.uf)) + Number(Boolean(filters.city))
  const isDefaultPeriod = filters.startDate === defaults.startDate && filters.endDate === defaults.endDate
  const returnErrors = dashboard?.sourceErrors.filter(({ source }) => source === 'retornos modernos' || source === 'retornos legados') ?? []
  const productErrors = dashboard?.sourceErrors.filter(({ source }) => source === 'retornos modernos' || source === 'retornos legados' || source === 'catálogo de produtos') ?? []
  const reasonsErrors = dashboard?.sourceErrors.filter(({ source }) => source === 'retornos modernos' || source === 'retornos legados' || source === 'motivos de devolução') ?? []

  function applyFilters() {
    setFilters(draftFilters)
    setIsFilterOpen(false)
  }

  function clearFilters() {
    const nextFilters = { ...defaults, status: '', uf: '', city: '' }
    setFilters(nextFilters)
    setDraftFilters(nextFilters)
  }

  function changeStartDate(value) {
    const nextEndDate = draftFilters.endDate && draftFilters.endDate < today ? draftFilters.endDate : today
    setDraftFilters((current) => ({ ...current, startDate: value > nextEndDate ? nextEndDate : value }))
  }

  function changeEndDate(value) {
    const nextEndDate = value > today ? today : value
    setDraftFilters((current) => ({ ...current, endDate: nextEndDate, startDate: current.startDate > nextEndDate ? nextEndDate : current.startDate }))
  }

  function selectRelativeWeek(weeks) {
    const shiftDate = (value) => {
      const date = new Date(`${value}T00:00:00`)
      date.setDate(date.getDate() + weeks * 7)
      const offset = date.getTimezoneOffset() * 60000
      return new Date(date.getTime() - offset).toISOString().slice(0, 10)
    }
    setDraftFilters((current) => {
      const startDate = shiftDate(currentWeek.startDate)
      const endDate = shiftDate(currentWeek.endDate)
      return { ...current, startDate, endDate: endDate > today ? today : endDate }
    })
  }

  const closeProductsModal = useCallback(() => {
    setIsProductsModalOpen(false)
    window.requestAnimationFrame(() => productsTriggerRef.current?.focus())
  }, [])

  const closeStoresModal = useCallback(() => {
    setIsStoresModalOpen(false)
    window.requestAnimationFrame(() => storesTriggerRef.current?.focus())
  }, [])

  const closeReasonsModal = useCallback(() => {
    setIsReasonsModalOpen(false)
    window.requestAnimationFrame(() => reasonsTriggerRef.current?.focus())
  }, [])

  return (
    <section className="management-dashboard">
      <div className="management-dashboard__toolbar">
        <PeriodIndicator startDate={filters.startDate} endDate={filters.endDate} isDefaultPeriod={isDefaultPeriod} />
        <FilterPopover activeFilterCount={activeFilterCount} isOpen={isFilterOpen} onToggle={setIsFilterOpen} onApply={applyFilters} onClear={clearFilters}>
          <FilterSection title="Período" count={periodFilterCount} id="dashboard-filter-period">
            <div className="management-dashboard__week-actions"><button type="button" onClick={() => selectRelativeWeek(-1)}>Semana anterior</button><button type="button" onClick={() => setDraftFilters((current) => ({ ...current, ...currentWeek }))}>Semana atual</button></div>
            <div className="management-dashboard__filter-dates">
              <label>Data inicial<input aria-label="Data inicial" type="date" value={draftFilters.startDate} max={draftFilters.endDate && draftFilters.endDate < today ? draftFilters.endDate : today} onChange={(event) => changeStartDate(event.target.value)} /></label>
              <label>Data final<input aria-label="Data final" type="date" value={draftFilters.endDate} min={draftFilters.startDate} max={today} onChange={(event) => changeEndDate(event.target.value)} /></label>
            </div>
          </FilterSection>
          <FilterSection title="Status" count={Number(Boolean(draftFilters.status))} id="dashboard-filter-status">
            <AppSelect aria-label="Status" value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">Todos</option><option value="Finalizada">Finalizada</option><option value="Pendente">Pendente</option><option value="Desconhecida">Desconhecida</option>
            </AppSelect>
          </FilterSection>
          <FilterSection title="UF" count={Number(Boolean(draftFilters.uf))} id="dashboard-filter-uf">
            <AppSelect aria-label="UF" searchable value={draftFilters.uf} onChange={(event) => setDraftFilters((current) => ({ ...current, uf: event.target.value, city: '' }))}>
              <option value="">Todas</option>{availableUfs.map((uf) => <option value={uf} key={uf}>{uf}</option>)}
            </AppSelect>
          </FilterSection>
          <FilterSection title="Cidade" count={Number(Boolean(draftFilters.city))} id="dashboard-filter-city">
            <AppSelect aria-label="Cidade" searchable value={draftFilters.city} onChange={(event) => setDraftFilters((current) => ({ ...current, city: event.target.value }))}>
              <option value="">Todas</option>{cities.map((city) => <option value={city} key={city}>{city}</option>)}
            </AppSelect>
          </FilterSection>
        </FilterPopover>
      </div>

      {query.isLoading && <DashboardSkeleton />}
      {!query.isLoading && query.error && <p className="management-dashboard__fatal-error" role="alert">{query.error.message}</p>}
      {!query.isLoading && !query.error && dashboard && <>
        <section className="management-dashboard__summary" aria-label="Resumo de NFDs">
          <SummaryCard label="Total de NFDs" total={dashboard.current.totalNfds} tone="total" />
          <SummaryCard label="Finalizada" total={dashboard.current.status.Finalizada} percentage={dashboard.current.totalNfds ? (dashboard.current.status.Finalizada / dashboard.current.totalNfds) * 100 : 0} tone="finalized" />
          <SummaryCard label="Pendente" total={dashboard.current.status.Pendente} percentage={dashboard.current.totalNfds ? (dashboard.current.status.Pendente / dashboard.current.totalNfds) * 100 : 0} tone="pending" />
          <SummaryCard label="Desconhecidas" total={dashboard.current.status.Desconhecida} percentage={dashboard.current.totalNfds ? (dashboard.current.status.Desconhecida / dashboard.current.totalNfds) * 100 : 0} tone="unknown" />
          <SummaryCard label="Diferença em dias (média)" value={dashboard.current.averageDays === null ? '—' : `${Math.round(dashboard.current.averageDays)} dias`} tone="days" />
        </section>

        <section className="management-dashboard__main-grid">
          <article className="management-dashboard__panel management-dashboard__financial-summary">
            <h2>Resumo Financeiro</h2>
            <div className="management-dashboard__money-total"><small>Valor total das notas</small><strong>{formatMoney(dashboard.current.finalized.financialTotal)}</strong></div>
            <div className="management-dashboard__financial-species">
              <section className="management-dashboard__financial-species-card"><h3>Galinha</h3><div><small>Valor de Faturado</small><strong>{formatMoney(dashboard.current.finalized.financial.galinhaBilled)}</strong></div><div><small>Valor de Retorno</small><strong>{returnErrors.length > 0 ? '—' : formatMoney(dashboard.current.finalized.financial.galinhaReturn)}</strong></div></section>
              <section className="management-dashboard__financial-species-card"><h3>Codorna</h3><div><small>Valor de Faturado</small><strong>{formatMoney(dashboard.current.finalized.financial.codornaBilled)}</strong></div><div><small>Valor de Retorno</small><strong>{returnErrors.length > 0 ? '—' : formatMoney(dashboard.current.finalized.financial.codornaReturn)}</strong></div></section>
            </div>
          </article>

          <article className="management-dashboard__panel management-dashboard__species-panel">
            <div className="management-dashboard__species-topline"><div><small>Faturado GAL</small><strong>{formatEggs(dashboard.current.finalized.galinhaBilled)}</strong><Evolution value={dashboard.evolutions.galinhaBilled} /></div><div><small>Faturado COD</small><strong>{formatEggs(dashboard.current.finalized.codornaBilled)}</strong><Evolution value={dashboard.evolutions.codornaBilled} /></div></div>
            <div className="management-dashboard__species-topline is-return"><div><small>Retorno GAL</small><strong>{dashboard.returnsAvailable ? formatEggs(dashboard.current.finalized.returns.galinha) : '—'}</strong><Evolution value={dashboard.evolutions.galinhaReturn} /></div><div><small>Retorno COD</small><strong>{dashboard.returnsAvailable ? formatEggs(dashboard.current.finalized.returns.codorna) : '—'}</strong><Evolution value={dashboard.evolutions.codornaReturn} /></div></div>
            {returnErrors.length > 0 ? <SourceError title="Indicadores de retorno indisponíveis" sourceErrors={returnErrors} /> : <>
              <div className="management-dashboard__gauges"><DashboardGauge label="Galinha" value={dashboard.current.finalized.galinhaBilled ? (dashboard.current.finalized.returns.galinha / dashboard.current.finalized.galinhaBilled) * 100 : 0} unavailable={dashboard.current.finalized.returns.unresolved > 0} /><DashboardGauge label="Codorna" value={dashboard.current.finalized.codornaBilled ? (dashboard.current.finalized.returns.codorna / dashboard.current.finalized.codornaBilled) * 100 : 0} unavailable={dashboard.current.finalized.returns.unresolved > 0} /></div>
              {dashboard.current.finalized.returns.unresolved > 0 && <p className="management-dashboard__data-note" role="status">Há retornos sem espécie identificável no período.</p>}
            </>}
          </article>

          <article className="management-dashboard__panel management-dashboard__chart-panel"><div className="management-dashboard__panel-heading"><h2>Evolução do valor financeiro (R$)</h2><span><i /> Valor (R$)</span></div><FinancialChart data={dashboard.financialSeries} /></article>
        </section>

        <section className="management-dashboard__bottom-grid">
          <article className="management-dashboard__panel management-dashboard__table-panel is-products-panel" id="dashboard-products">
            <h2>Produtos (Novo modelo)</h2>
            {productErrors.length > 0 ? <SourceError title="Produtos indisponíveis" sourceErrors={productErrors} /> : dashboard.products.length === 0 ? <TableEmpty>Nenhum retorno novo com produto detalhado no período.</TableEmpty> : <div className="management-dashboard__table-scroll"><table><thead><tr>{productColumns.map((column) => <SortableHeader key={column.key} column={column} sort={productTable.sort} onSort={productTable.toggleSort} />)}</tr></thead><tbody>{productTable.sortedItems.map((product) => <tr key={`${product.name}-${product.category}`}><td>{product.name}</td><td>{formatEggs(product.billed)}</td><td>{formatEggs(product.returned)}</td><td>{formatPercent(product.returnPercentage)}</td><td>{product.mainReason}</td></tr>)}</tbody></table></div>}
            <button ref={productsTriggerRef} type="button" className="management-dashboard__see-all is-action" onClick={() => setIsProductsModalOpen(true)}>Ver todos os produtos <b>→</b></button>
          </article>
          <article className="management-dashboard__panel management-dashboard__reasons-panel"><h2>Principais motivos de devolução</h2>{reasonsErrors.length > 0 ? <SourceError title="Motivos indisponíveis" sourceErrors={reasonsErrors} /> : dashboard.reasons.length === 0 ? <TableEmpty>Nenhum motivo registrado no período.</TableEmpty> : <ol>{dashboard.reasons.map((reason, index) => <li key={reason.name}><span className="management-dashboard__reason-rank">{index + 1}</span><span className="management-dashboard__reason-name">{reason.name}</span><span className="management-dashboard__reason-bar"><i style={{ width: `${Math.max(3, reason.percentage)}%` }} /></span><span className="management-dashboard__reason-totals"><small>Faturado {formatEggs(reason.billed)}</small><strong>Retorno {formatEggs(reason.returned)} <em>({formatPercent(reason.percentage)})</em></strong></span><Evolution value={reason.evolution} /></li>)}</ol>}<button ref={reasonsTriggerRef} type="button" className="management-dashboard__see-all is-action" onClick={() => setIsReasonsModalOpen(true)}>Ver todos os motivos <b>→</b></button></article>
          <article className="management-dashboard__panel management-dashboard__table-panel is-stores-panel">
            <h2>Lojas e índice de retorno</h2>
            {returnErrors.length > 0 ? <SourceError title="Lojas indisponíveis" sourceErrors={returnErrors} /> : dashboard.stores.length === 0 ? <TableEmpty>Nenhuma NFD finalizada.</TableEmpty> : <div className="management-dashboard__table-scroll"><table><thead><tr>{storeColumns.map((column) => <SortableHeader key={column.key} column={column} sort={storeTable.sort} onSort={storeTable.toggleSort} />)}</tr></thead><tbody>{storeTable.sortedItems.map((store) => <tr key={store.name}><td>{store.name}</td><td>{formatEggs(store.billed)}</td><td>{formatEggs(store.returned)}</td><td>{formatPercent(store.returnPercentage)}</td></tr>)}</tbody></table></div>}
            <button ref={storesTriggerRef} type="button" className="management-dashboard__see-all is-action" onClick={() => setIsStoresModalOpen(true)}>Ver todas as lojas <b>→</b></button>
          </article>
        </section>
        <ProductsModal products={dashboard.allProducts ?? dashboard.products} errors={productErrors} isOpen={isProductsModalOpen} onClose={closeProductsModal} />
        <ManagementListModal
          title="Lojas e índice de retorno"
          modalId="stores-modal-title"
          itemLabel="lojas"
          searchPlaceholder="Buscar loja..."
          searchLabel="Buscar loja"
          emptyMessage="Nenhuma loja encontrada."
          searchEmptyMessage="Não encontramos lojas para esta busca."
          items={dashboard.allStores ?? dashboard.stores}
          errors={returnErrors}
          errorTitle="Lojas indisponíveis"
          getSearchText={(store) => store.name}
          getItemKey={(store) => store.name}
          variant="stores"
          columns={[
            { key: 'name', label: 'Loja', sortValue: (store) => store.name, render: (store) => store.name },
            { key: 'billed', label: 'Qtd. faturada', sortValue: (store) => store.billed, render: (store) => formatEggs(store.billed) },
            { key: 'returned', label: 'Qtd. retorno', sortValue: (store) => store.returned, render: (store) => formatEggs(store.returned) },
            { key: 'percentage', label: '% de retorno', sortValue: (store) => store.returnPercentage, className: (store) => 'is-' + getGaugeTone(store.returnPercentage), render: (store) => formatPercent(store.returnPercentage) },
          ]}
          isOpen={isStoresModalOpen}
          onClose={closeStoresModal}
        />
        <ManagementListModal
          title="Principais motivos de devolução"
          modalId="reasons-modal-title"
          itemLabel="motivos"
          searchPlaceholder="Buscar motivo..."
          searchLabel="Buscar motivo"
          emptyMessage="Nenhum motivo encontrado."
          searchEmptyMessage="Nenhum motivo encontrado para esta busca."
          items={dashboard.allReasons ?? dashboard.reasons}
          errors={reasonsErrors}
          errorTitle="Motivos indisponíveis"
          getSearchText={(reason) => reason.name}
          getItemKey={(reason) => reason.name}
          variant="reasons"
          columns={[
            { key: 'rank', label: '#', sortValue: (reason) => reason.rank, className: () => 'is-rank', render: (reason) => <span className="management-dashboard__reason-rank">{reason.rank}</span> },
            { key: 'name', label: 'Motivo', sortValue: (reason) => reason.name, className: () => 'is-reason-name', render: (reason) => reason.name },
            { key: 'bar', label: '', className: () => 'is-reason-bar', render: (reason) => <span className="management-dashboard__reason-bar"><i style={{ width: `${Math.max(3, reason.percentage)}%` }} /></span> },
            { key: 'billed', label: 'Faturado', sortValue: (reason) => reason.billed, render: (reason) => formatEggs(reason.billed) },
            { key: 'returned', label: 'Retorno', sortValue: (reason) => reason.returned, render: (reason) => formatEggs(reason.returned) },
            { key: 'percentage', label: '% do total', sortValue: (reason) => reason.percentage, render: (reason) => formatPercent(reason.percentage) },
            { key: 'evolution', label: 'Variação', className: (reason) => reason.evolutionAvailable ? 'is-' + reason.evolution.direction : 'is-neutral', render: (reason) => <ReasonEvolution reason={reason} /> },
          ]}
          isOpen={isReasonsModalOpen}
          onClose={closeReasonsModal}
        />
      </>}
    </section>
  )
}
