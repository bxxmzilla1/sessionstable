import Icon from '../Icon'

// Mobile-only bottom tab bar. Desktop hides it via CSS. `active` is one of
// 'home' | 'workspace' | 'vpn'; Settings opens the modal, so it isn't a tab state.
export default function FooterNav({ active, onHome, onWorkspace, onVpn, onSettings }) {
  const item = (key, icon, label, onClick) => (
    <button className={'fn-item' + (active === key ? ' on' : '')} onClick={onClick}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  )
  return (
    <nav className="footer-nav">
      {item('home', 'home', 'Home', onHome)}
      {item('workspace', 'table', 'Workspace', onWorkspace)}
      {item('vpn', 'vpn', 'VPN', onVpn)}
      {item('settings', 'settings', 'Settings', onSettings)}
    </nav>
  )
}
