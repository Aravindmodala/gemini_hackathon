import { useEffect, useState } from 'react';

interface ProfileMenuProps {
  onClose: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onSignOut: () => void;
}

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  right: 0,
  width: 180,
  background: 'rgba(15, 10, 26, 0.95)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(124, 58, 237, 0.3)',
  borderRadius: 10,
  padding: '6px 0',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  zIndex: 30,
};

const itemBaseStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '9px 16px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  color: '#e2e8f0',
  transition: 'background 0.15s ease',
};

const itemHoverStyle: React.CSSProperties = {
  background: 'rgba(124, 58, 237, 0.18)',
};

const dividerStyle: React.CSSProperties = {
  margin: '4px 0',
  borderTop: '1px solid rgba(124, 58, 237, 0.2)',
};

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      role="menuitem"
      style={{
        ...itemBaseStyle,
        ...(hovered ? itemHoverStyle : {}),
        ...(danger ? { color: '#f87171' } : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function ProfileMenu({ onClose, onProfile, onSettings, onSignOut }: ProfileMenuProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div style={menuStyle} role="menu">
      <MenuItem label="Profile" onClick={onProfile} />
      <MenuItem label="Settings" onClick={onSettings} />
      <div style={dividerStyle} />
      <MenuItem label="Sign Out" onClick={onSignOut} danger />
    </div>
  );
}
