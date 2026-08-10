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

function hexToHsl(hex) {
  let h = String(hex).replace('#', '')
  if (h.length === 3) h = h.split('').map((x) => x + x).join('')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let hue = 0
  let sat = 0
  if (d) {
    sat = d / (1 - Math.abs(2 * l - 1))
    if (max === r) hue = ((g - b) / d) % 6
    else if (max === g) hue = (b - r) / d + 2
    else hue = (r - g) / d + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  return { h: Math.round(hue), s: Math.round(sat * 100), l: Math.round(l * 100) }
}

// Resolve an option's chip colors. `color` is either a palette index (number) or a custom
// '#rrggbb' picked with the color wheel — custom hues get the same Airtable treatment as
// the palette: a light tint background with darker readable text of the same hue.
export function optionColor(option) {
  const c = option?.color
  if (typeof c === 'string' && c.startsWith('#')) {
    const { h, s } = hexToHsl(c)
    const sat = Math.min(s, 85)
    return { name: 'custom', bg: `hsl(${h}, ${sat}%, 91%)`, text: `hsl(${h}, ${sat}%, 30%)` }
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
