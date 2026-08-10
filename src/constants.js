// Field types (mirrors Airtable's core set).
// `icon` is an Icon component name (see Icon.jsx) — rendered as an SVG, never an emoji.
export const FIELD_TYPES = [
  { id: 'text', name: 'Single line text', icon: 'text' },
  { id: 'longText', name: 'Long text', icon: 'longText' },
  { id: 'number', name: 'Number', icon: 'number' },
  { id: 'checkbox', name: 'Checkbox', icon: 'checkbox' },
  { id: 'singleSelect', name: 'Single select', icon: 'singleSelect' },
  { id: 'multiSelect', name: 'Multiple select', icon: 'multiSelect' },
  { id: 'date', name: 'Date', icon: 'date' },
  { id: 'email', name: 'Email', icon: 'email' },
  { id: 'url', name: 'URL', icon: 'url' },
  { id: 'phone', name: 'Phone', icon: 'phone' },
  { id: 'rating', name: 'Rating', icon: 'rating' },
]

export const FIELD_TYPE_MAP = Object.fromEntries(FIELD_TYPES.map((t) => [t.id, t]))

// Airtable-like tag palette for select options (light bg + readable text).
export const OPTION_PALETTE = [
  { name: 'purple', bg: '#ede9fe', text: '#6d28d9' },
  { name: 'blue', bg: '#dbeafe', text: '#1d4ed8' },
  { name: 'teal', bg: '#ccfbf1', text: '#0f766e' },
  { name: 'green', bg: '#dcfce7', text: '#15803d' },
  { name: 'yellow', bg: '#fef9c3', text: '#a16207' },
  { name: 'orange', bg: '#ffedd5', text: '#c2410c' },
  { name: 'red', bg: '#fee2e2', text: '#b91c1c' },
  { name: 'pink', bg: '#fce7f3', text: '#be185d' },
  { name: 'cyan', bg: '#cffafe', text: '#0e7490' },
  { name: 'gray', bg: '#eef0f4', text: '#4b5563' },
]

// Resolve an option's chip colors. `color` is either a palette index (number) or a custom
// '#rrggbb' picked with the color wheel. A custom pick is used as the chip BACKGROUND
// exactly as chosen, and the text auto-adapts for contrast: white on dark colors,
// near-black on bright ones (perceived-brightness / YIQ formula).
export function optionColor(option) {
  const c = option?.color
  if (typeof c === 'string' && c.startsWith('#')) {
    let h = c.slice(1)
    if (h.length === 3) h = h.split('').map((x) => x + x).join('')
    const r = parseInt(h.slice(0, 2), 16) || 0
    const g = parseInt(h.slice(2, 4), 16) || 0
    const b = parseInt(h.slice(4, 6), 16) || 0
    const brightness = (r * 299 + g * 587 + b * 114) / 1000 // 0 (black) … 255 (white)
    return { name: 'custom', bg: c, text: brightness >= 140 ? '#1f2430' : '#ffffff' }
  }
  return OPTION_PALETTE[(Number(c) || 0) % OPTION_PALETTE.length]
}

export const SELECT_TYPES = ['singleSelect', 'multiSelect']
export const TEXTUAL_TYPES = ['text', 'longText', 'email', 'url', 'phone']

// Filter operators available per field type.
export const OPERATORS = {
  default: [
    { id: 'contains', name: 'contains' },
    { id: 'notContains', name: "doesn't contain" },
    { id: 'is', name: 'is' },
    { id: 'isNot', name: 'is not' },
    { id: 'empty', name: 'is empty' },
    { id: 'notEmpty', name: 'is not empty' },
  ],
  number: [
    { id: 'is', name: '=' },
    { id: 'isNot', name: '≠' },
    { id: 'lt', name: '<' },
    { id: 'gt', name: '>' },
    { id: 'lte', name: '≤' },
    { id: 'gte', name: '≥' },
    { id: 'empty', name: 'is empty' },
    { id: 'notEmpty', name: 'is not empty' },
  ],
  checkbox: [
    { id: 'checked', name: 'is checked' },
    { id: 'unchecked', name: 'is unchecked' },
  ],
}

export function operatorsFor(type) {
  if (type === 'number' || type === 'rating') return OPERATORS.number
  if (type === 'checkbox') return OPERATORS.checkbox
  return OPERATORS.default
}
