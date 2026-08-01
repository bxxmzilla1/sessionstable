// Field types (mirrors Airtable's core set).
export const FIELD_TYPES = [
  { id: 'text', name: 'Single line text', icon: 'A' },
  { id: 'longText', name: 'Long text', icon: '¶' },
  { id: 'number', name: 'Number', icon: '#' },
  { id: 'checkbox', name: 'Checkbox', icon: '☑' },
  { id: 'singleSelect', name: 'Single select', icon: '◉' },
  { id: 'multiSelect', name: 'Multiple select', icon: '☰' },
  { id: 'date', name: 'Date', icon: '◷' },
  { id: 'email', name: 'Email', icon: '@' },
  { id: 'url', name: 'URL', icon: '↗' },
  { id: 'phone', name: 'Phone', icon: '☏' },
  { id: 'rating', name: 'Rating', icon: '★' },
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
