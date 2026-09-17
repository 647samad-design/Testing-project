import { Link, NavLink, useLocation } from 'react-router-dom';
import { Scale, Home, FileText, Users, GitCompare, Menu, LogIn, User, LogOut, ChevronRight, Sparkles, ShieldCheck, Megaphone, BookOpen, Search, Globe, Rss } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { LANGUAGE_OPTIONS, type LanguageName } from '@/types';

const navItems = [
  { to: '/ballot', label: 'My Ballot', icon: FileText },
  { to: '/candidates', label: 'Candidates', icon: Users },
  { to: '/compare', label: 'Compare', icon: GitCompare },
  { to: '/feed', label: 'Civic Wire', icon: Rss },
  { to: '/lens', label: 'Lens This', icon: Search },
  { to: '/stories', label: 'Stories', icon: BookOpen },
];

const mobileNavItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/ballot', label: 'Ballot', icon: FileText },
  { to: '/feed', label: 'Wire', icon: Rss },
  { to: '/lens', label: 'Lens', icon: Search },
  { to: '/candidates', label: 'People', icon: Users },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, profile, signOut, isDemo } = useAuth();
  const location = useLocation();

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 touch-target">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm shadow-primary/20">
              <Scale className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-foreground hidden sm:inline">
              Ballot<span className="text-primary">Lens</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-xl px-4 py-2.5 text-sm font-semibold transition-all touch-target',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <Link to="/ask" className="hidden md:block">
              <Button variant="ghost" size="sm" className="gap-2 font-semibold text-accent hover:text-accent/80 touch-target rounded-xl">
                <Sparkles className="h-4 w-4" />
                Ask AI
              </Button>
            </Link>

            {user ? (
              <div className="hidden md:flex items-center gap-2">
                {profile?.is_admin && (
                  <Link to="/admin">
                    <Button variant="ghost" size="sm" className="gap-2 rounded-xl touch-target">
                      <ShieldCheck className="h-4 w-4" />
                      Admin
                    </Button>
                  </Link>
                )}
                <Link to="/account">
                  <Button variant="ghost" size="sm" className="gap-2 rounded-xl touch-target">
                    <User className="h-4 w-4" />
                    {profile?.full_name ?? 'Account'}
                    {isDemo && <span className="ml-1.5 rounded-md bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold text-warning">DEMO</span>}
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => signOut()}
                  className="gap-2 rounded-xl touch-target"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <Link to="/signin" className="hidden md:block">
                <Button size="sm" className="gap-2 rounded-xl touch-target font-semibold">
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Button>
              </Link>
            )}

            {/* Mobile menu trigger */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden rounded-xl touch-target"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-80 p-0">
          <SheetHeader className="px-6 pt-6">
            <SheetTitle className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary">
                <Scale className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-extrabold">BallotLens</span>
            </SheetTitle>
          </SheetHeader>
          <nav className="mt-8 space-y-1 px-3">
            {[...navItems, { to: '/ask', label: 'Ask BallotLens AI', icon: Sparkles }, { to: '/candidate-portal', label: 'Candidate Portal', icon: ShieldCheck }, { to: '/advertise', label: 'Advertise', icon: Megaphone }].slice(0, 8).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold transition-all touch-target',
                  location.pathname === item.to
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
                <ChevronRight className="ml-auto h-4 w-4 opacity-50" />
              </Link>
            ))}

            <div className="my-3 border-t border-border" />

            {user ? (
              <>
                {profile?.is_admin && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all touch-target"
                  >
                    <ShieldCheck className="h-5 w-5" />
                    Admin
                    <ChevronRight className="ml-auto h-4 w-4 opacity-50" />
                  </Link>
                )}
                <Link
                  to="/account"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all touch-target"
                >
                  <User className="h-5 w-5" />
                  {profile?.full_name ?? 'My Account'}
                  {isDemo && <span className="ml-1.5 rounded-md bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold text-warning">DEMO</span>}
                  <ChevronRight className="ml-auto h-4 w-4 opacity-50" />
                </Link>
                <button
                  onClick={() => {
                    signOut();
                    setMobileOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all touch-target"
                >
                  <LogOut className="h-5 w-5" />
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                to="/signin"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground transition-all touch-target"
              >
                <LogIn className="h-5 w-5" />
                Sign In
              </Link>
            )}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Mobile bottom nav — iOS style */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background/90 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-1.5">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-all touch-target',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )
              }
            >
              <item.icon className="h-[22px] w-[22px]" strokeWidth={2.2} />
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/ask"
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-all touch-target',
                isActive ? 'text-accent' : 'text-muted-foreground'
              )
            }
          >
            <Sparkles className="h-[22px] w-[22px]" strokeWidth={2.2} />
            Ask AI
          </NavLink>
        </div>
      </nav>
    </>
  );
}

function LanguageSelector() {
  const { profile, setLanguage } = useAuth();
  const current: LanguageName =
    profile?.language_preference ??
    (localStorage.getItem('ballotlens_lang') as LanguageName) ??
    'en';

  return (
    <div className="flex items-center gap-2">
      <Globe className="h-4 w-4 text-muted-foreground" />
      <select
        value={current}
        onChange={(e) => {
          const lang = e.target.value as LanguageName;
          setLanguage(lang);
        }}
        aria-label="Choose language"
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground touch-target transition-all hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {LANGUAGE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.nativeLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-secondary/20 mt-12 pb-24 md:pb-0">
      <div className="mx-auto max-w-content px-4 sm:px-6 py-10">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm shadow-primary/20">
                <Scale className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-extrabold tracking-tight">
                Ballot<span className="text-primary">Lens</span>
              </span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground max-w-xs leading-relaxed">
              See your ballot. Know your candidates. Follow the evidence.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-foreground">BallotLens</h4>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li><Link to="/about" className="text-muted-foreground hover:text-primary transition-colors">About</Link></li>
              <li><Link to="/how-it-works" className="text-muted-foreground hover:text-primary transition-colors">How It Works</Link></li>
              <li><Link to="/methodology" className="text-muted-foreground hover:text-primary transition-colors">Methodology</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold text-foreground">Resources</h4>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li><Link to="/sources" className="text-muted-foreground hover:text-primary transition-colors">Sources</Link></li>
              <li><Link to="/stories" className="text-muted-foreground hover:text-primary transition-colors">Civic Stories</Link></li>
              <li><Link to="/news" className="text-muted-foreground hover:text-primary transition-colors">News</Link></li>
              <li><Link to="/ask" className="text-muted-foreground hover:text-primary transition-colors">Ask BallotLens AI</Link></li>
              <li><Link to="/pricing" className="text-muted-foreground hover:text-primary transition-colors">Premium</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold text-foreground">Business</h4>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li><Link to="/advertise" className="text-muted-foreground hover:text-primary transition-colors">Advertise</Link></li>
              <li><Link to="/candidate-portal" className="text-muted-foreground hover:text-primary transition-colors">Candidate Portal</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold text-foreground">Legal</h4>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li><Link to="/privacy" className="text-muted-foreground hover:text-primary transition-colors">Privacy</Link></li>
              <li><Link to="/terms" className="text-muted-foreground hover:text-primary transition-colors">Terms</Link></li>
              <li><Link to="/disclaimer" className="text-muted-foreground hover:text-primary transition-colors">Disclaimer</Link></li>
              <li><Link to="/accessibility" className="text-muted-foreground hover:text-primary transition-colors">Accessibility</Link></li>
              <li><Link to="/contact" className="text-muted-foreground hover:text-primary transition-colors">Contact</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            BallotLens provides informational and educational content. It does not
            endorse or recommend candidates or political positions. Always verify
            important information using original sources and your official election
            authority.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} BallotLens. A neutral voter-information platform.
          </p>
          <LanguageSelector />
        </div>
      </div>
    </footer>
  );
}
