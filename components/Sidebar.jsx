'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, Users, Bell, LogOut, Settings,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const navItems = [
  { to: '/dashboard',     icon: Home,          label: 'Dashboard' },
  { to: '/patients',      icon: Users,         label: 'Patients'  },
  { to: '/notifications', icon: Bell,          label: 'Notifications' },
];

const adminItems = [
  { to: '/settings',  icon: Settings,      label: 'Settings'      },
];

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuthStore();
  const router           = useRouter();
  const pathname         = usePathname();

  function handleLogout() {
    logout();
    router.push('/login');
  }

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'MT';

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  function displayRole(role) {
    if (role === 'superadmin') return 'Admin';
    if (role === 'admin') return 'Admin';
    if (!role) return 'Staff';
    return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function navClass(to) {
    const isActive = pathname === to || (to !== '/dashboard' && pathname.startsWith(to));
    return `nav-item${isActive ? ' active' : ''}`;
  }

  return (
    <aside className={`sidebar${isOpen ? ' sidebar-open' : ''}`}>
      {/* Brand */}
      <div className="sidebar-brand">
        <Link
          href="/dashboard"
          className="sidebar-brand-link"
          title="TiniTraker - Timeline of care"
          onClick={(e) => e.currentTarget.blur()}
        >
          <div className="sidebar-brand-logo-wrap">
            <div className="sidebar-brand-logo-inner">
              <img
                src="/tinitraker-logo.png"
                alt="TiniTraker Logo"
                className="sidebar-brand-logo"
              />
            </div>
          </div>
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-name">TiniTraker</div>
            <div className="sidebar-brand-sub">Timeline of care</div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {navItems.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            href={to}
            className={navClass(to)}
            title={label}
            onClick={(e) => e.currentTarget.blur()}
          >
            <div className="nav-item-icon-wrap">
              <Icon size={20} strokeWidth={2} />
            </div>
            <span className="nav-item-label">{label}</span>
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className="sidebar-section-divider">
              <span className="sidebar-section-line" />
              <span className="sidebar-section-text">Admin</span>
            </div>
            {adminItems.map(({ to, icon: Icon, label }) => (
              <Link
                key={to}
                href={to}
                className={navClass(to)}
                title={label}
                onClick={(e) => e.currentTarget.blur()}
              >
                <div className="nav-item-icon-wrap">
                  <Icon size={20} strokeWidth={2} />
                </div>
                <span className="nav-item-label">{label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Decorative Promo Card */}
      <div className="sidebar-promo">
        <img
          src="/sidebar-card.png"
          alt="Healthier Mothers Brighter Tomorrows"
          className="sidebar-promo-img"
        />
      </div>

      {/* User footer / Profile pic */}
      <div className="sidebar-footer">
        <div className="sidebar-user" title={user?.name ? `${user.name} (${displayRole(user?.role)})` : 'User profile'}>
          <div className="sidebar-avatar-wrapper">
            <div className="sidebar-avatar">
              {user?.profile_picture ? (
                <img src={user.profile_picture} alt={user.name || 'User'} className="sidebar-avatar-img" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <span className="sidebar-avatar-status" title="Active" />
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name" title={user?.name || 'User'}>
              {user?.name || 'User'}
            </div>
            <div className="sidebar-user-role">{displayRole(user?.role)}</div>
          </div>
          <button
            onClick={(e) => {
              e.currentTarget.blur();
              handleLogout();
            }}
            className="sidebar-logout-btn"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
