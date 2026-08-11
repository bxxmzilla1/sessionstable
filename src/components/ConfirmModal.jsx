import { useEffect } from 'react'

/**
 * Small "are you sure?" dialog used before destructive actions
 * (deleting a workspace or a tab sheet). Escape / scrim click cancels.
 */
export default function ConfirmModal({ title, message, confirmLabel = 'Delete', onConfirm, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cm-title">{title}</div>
        <div className="cm-msg">{message}</div>
        <div className="cm-actions">
          <button className="btn ghost sm" autoFocus onClick={onClose}>Cancel</button>
          <button className="btn danger sm" onClick={() => { onClose(); onConfirm() }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
