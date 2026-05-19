import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type AuthUser } from '../../hooks/useAuth';
import api from '../../lib/api';
import { msalInstance, loginRequest } from '../../lib/msalConfig';

// ─── SSO response shape ───────────────────────────────────────────────────────

interface SsoResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Microsoft logo ───────────────────────────────────────────────────────────

function MicrosoftLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" width="18" height="18" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

// ─── Target icon ──────────────────────────────────────────────────────────────

function TargetIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const ssoEnabled = Boolean(import.meta.env.VITE_AAD_CLIENT_ID);

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  // ── Local login ─────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Login failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // ── Microsoft SSO login ─────────────────────────────────────────────────────

  async function handleSsoLogin() {
    setError(null);
    setSsoLoading(true);
    try {
      await msalInstance.initialize();
      const result = await msalInstance.loginPopup(loginRequest);
      const idToken = result.idToken;
      const { data } = await api.post<SsoResponse>('/auth/sso/token', { idToken });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      // Refresh the page to update auth state
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as { message?: string })?.message ??
        'Microsoft sign-in failed. Please try again.';
      setError(message);
    } finally {
      setSsoLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      {/* Background Video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0"
        style={{ filter: 'brightness(0.2) contrast(1.1)' }}
      >
        <source src="/12080630-uhd_3456_2160_30fps.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Dark overlay for better contrast */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1f0c25]/40 to-[#2d1238]/60 z-[1]"></div>

      {/* Content Container */}
      <div className="relative z-10 flex w-full min-h-screen">

        {/* ── Right: Login form ─────────────────────────────────────────────── */}
        <div className="flex w-full items-center justify-center px-4 py-12 ">
          <div className="w-full max-w-md motion-safe:animate-slide-up">
            {/* Mobile logo */}
            <div className="mb-8 flex flex-col items-center lg:hidden">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1f0c25] text-white shadow-lg">
                <TargetIcon />
              </div>
              <h1 className="mt-3 text-2xl font-bold text-white">GoalTrack</h1>
            </div>

            {/* Card */}
            <div className="rounded-2xl bg-white/95 backdrop-blur-sm p-8 shadow-2xl ring-1 ring-white/20">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Sign in</h2>
                <p className="mt-1 text-sm text-gray-500">Enter your credentials to continue</p>
              </div>

            {/* Error banner */}
            {error && (
              <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-[#1f0c25] focus:outline-none focus:ring-2 focus:ring-[#1f0c25]/20 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-[#1f0c25] focus:outline-none focus:ring-2 focus:ring-[#1f0c25]/20 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1f0c25] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#2d1238] focus:outline-none focus:ring-2 focus:ring-[#1f0c25] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Spinner />
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            {/* SSO */}
            {ssoEnabled && (
              <>
                <div className="my-6 flex items-center gap-3" aria-hidden="true">
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="text-xs font-medium text-gray-400">or</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>

                <button
                  type="button"
                  onClick={handleSsoLogin}
                  disabled={ssoLoading}
                  className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1f0c25] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {ssoLoading ? <Spinner /> : <MicrosoftLogo />}
                  {ssoLoading ? 'Signing in…' : 'Sign in with Microsoft'}
                </button>
              </>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
