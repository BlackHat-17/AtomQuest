import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { geminiEnabled } from '../../lib/gemini';

const NAV_LINKS = {
  EMPLOYEE: [
    { to: '/employee/goals', label: 'My Goals' },
    { to: '/employee/achievements', label: 'Achievements' },
  ],
  MANAGER: [
    { to: '/employee/goals', label: 'My Goals' },
    { to: '/manager/team', label: 'Team Dashboard' },
  ],
  ADMIN: [
    { to: '/employee/goals', label: 'My Goals' },
    { to: '/admin/reports', label: 'Reports' },
    { to: '/admin/analytics', label: 'Analytics' },
    { to: '/admin/cycles', label: 'Cycles' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/escalation-rules', label: 'Escalations' },
    { to: '/admin/audit', label: 'Audit Log' },
  ],
};

const ROLE_BADGE_COLORS = {
  EMPLOYEE: 'bg-[#1f0c25]/30 text-[#1f0c25]/80',
  MANAGER: 'bg-[#2d1238]/30 text-[#2d1238]/80',
  ADMIN: 'bg-rose-500/30 text-rose-100',
};

function TargetIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      {open ? (<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>) : (<><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>)}
    </svg>
  );
}

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const links = user ? NAV_LINKS[user.role] ?? [] : [];
  const initials = user ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 bg-gradient-to-r from-[#1f0c25] via-[#2d1238] to-[#3d1f4a] shadow-lg">
        {/* Subtle animated shimmer line at top */}
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-gradient" />

        <div className="mx-auto flex h-15 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 py-3">
          {/* Logo */}
          <NavLink to="/dashboard" className="flex items-center gap-2 text-white transition-all duration-200 hover:opacity-90 hover:scale-105">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
              <TargetIcon />
            </div>
            <span className="text-lg font-bold tracking-tight">GoalTrack</span>
            {geminiEnabled && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium text-white/90">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
                AI
              </span>
            )}
          </NavLink>

          {/* Desktop nav */}
          {user && (
            <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main navigation">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-white/20 text-white shadow-sm'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          )}

          {/* Right: avatar dropdown */}
          {user && (
            <div className="hidden items-center gap-2 md:flex relative">
              <button
                onClick={() => setProfileOpen(o => !o)}
                className="flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-1.5 text-white transition-all duration-200 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-xs font-bold ring-2 ring-white/30">
                  {initials}
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold leading-tight">{user.name.split(' ')[0]}</p>
                  <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_BADGE_COLORS[user.role]}`}>
                    {user.role}
                  </span>
                </div>
                <svg className={`h-3.5 w-3.5 text-white/70 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown */}
              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl bg-white shadow-xl ring-1 ring-gray-200 z-20 animate-scale-in overflow-hidden">
                    <div className="bg-gradient-to-r from-[#1f0c25]/5 to-[#2d1238]/5 px-4 py-3 border-b border-gray-100">
                      <p className="font-semibold text-gray-900 text-sm">{user.name}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                    <div className="py-1">
                      <NavLink
                        to="/profile"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        My Profile
                      </NavLink>
                      <NavLink
                        to="/dashboard"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        Dashboard
                      </NavLink>
                      {geminiEnabled && (
                        <NavLink
                          to="/profile"
                          onClick={() => { setProfileOpen(false); }}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#2d1238] hover:bg-[#2d1238]/5 transition-colors"
                        >
                          <svg className="h-4 w-4 text-[#2d1238]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          AI Assistant
                        </NavLink>
                      )}
                    </div>
                    <div className="border-t border-gray-100 py-1">
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mobile hamburger */}
          {user && (
            <button
              className="rounded-lg p-2 text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50 md:hidden"
              onClick={() => setMobileOpen(o => !o)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              <HamburgerIcon open={mobileOpen} />
            </button>
          )}
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && user && (
        <>
          <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-40 w-72 bg-gradient-to-b from-[#1f0c25] to-[#2d1238] shadow-2xl md:hidden animate-slide-right">
            <div className="flex h-16 items-center gap-2 px-4 text-white border-b border-white/10">
              <TargetIcon />
              <span className="text-lg font-bold">GoalTrack</span>
              {geminiEnabled && <span className="ml-auto text-xs bg-white/20 rounded-full px-2 py-0.5">AI ✨</span>}
            </div>

            <div className="mx-4 my-4 flex items-center gap-3 rounded-xl bg-white/10 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/25 text-sm font-bold text-white">{initials}</div>
              <div>
                <p className="text-sm font-semibold text-white">{user.name}</p>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_BADGE_COLORS[user.role]}`}>{user.role}</span>
              </div>
            </div>

            <nav className="flex flex-col gap-1 px-4">
              {links.map(link => (
                <NavLink key={link.to} to={link.to} onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
                  {link.label}
                </NavLink>
              ))}
              <NavLink to="/profile" onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
                👤 My Profile
              </NavLink>
            </nav>

            <div className="absolute bottom-8 left-4 right-4">
              <button onClick={handleLogout} className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition-colors">
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default Navbar;
