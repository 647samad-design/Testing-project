import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Scale, Mail, Lock, User as UserIcon, Globe, CheckCircle2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { LANGUAGE_OPTIONS, type LanguageName } from '@/types';

export function SignInPage() {
  const navigate = useNavigate();
  const { signIn, signUp, signInAsDemo } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [language, setLanguage] = useState<LanguageName>(
    (localStorage.getItem('ballotlens_lang') as LanguageName) ?? 'en'
  );
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (mode === 'signin') {
      const { error } = await signIn(email, password);
      if (error) {
        setError(error);
        setLoading(false);
      } else {
        navigate('/onboarding');
      }
    } else {
      const { error } = await signUp(email, password, fullName, language);
      if (error) {
        if (error.includes('Check your email')) {
          setInfo(error);
          setLoading(false);
        } else {
          setError(error);
          setLoading(false);
        }
      } else {
        navigate('/onboarding');
      }
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 animate-fade-in">
      <div className="text-center mb-8">
        <Link to="/" className="inline-flex items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
            <Scale className="h-6 w-6 text-primary-foreground" />
          </div>
        </Link>
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === 'signin'
            ? 'Sign in to save your issues, candidates and races.'
            : 'Your political preferences are always private.'}
        </p>
      </div>

      <Card className="p-8 rounded-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
          )}

          {mode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="language">App Language</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <select
                  id="language"
                  value={language}
                  onChange={(e) => {
                    const lang = e.target.value as LanguageName;
                    setLanguage(lang);
                    localStorage.setItem('ballotlens_lang', lang);
                    document.documentElement.setAttribute('lang', lang);
                  }}
                  className="flex h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.nativeLabel} ({opt.label})
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">Choose the language for the app. You can change this later.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
                required
                minLength={6}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}

          {info && (
            <div className="flex items-start gap-2 rounded-xl bg-success/10 p-3">
              <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
              <p className="text-sm text-success font-medium">{info}</p>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl text-base font-bold touch-target">
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
              setInfo(null);
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <button
            onClick={() => {
              signInAsDemo();
              navigate('/account');
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary transition-all touch-target"
          >
            <Eye className="h-4 w-4" />
            Explore as Demo User
          </button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Preview the logged-in experience without creating an account.
          </p>
        </div>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        BallotLens does not publicly disclose your political preferences.
      </p>
    </div>
  );
}
