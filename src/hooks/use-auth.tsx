import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, LanguageName } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isDemo: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, language?: LanguageName) => Promise<{ error: string | null }>;
  signInAsDemo: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setLanguage: (language: LanguageName) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, zip_code, is_admin, language_preference')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      setProfile(null);
      return;
    }
    const p = data as Profile | null;
    setProfile(p);

    // Sync language to localStorage + DOM
    const lang = p?.language_preference ?? null;
    const savedLang = localStorage.getItem('ballotlens_lang') as LanguageName | null;
    const effectiveLang = lang ?? savedLang ?? 'en';
    localStorage.setItem('ballotlens_lang', effectiveLang);
    document.documentElement.setAttribute('lang', effectiveLang);
  }

  useEffect(() => {
    // Apply saved language immediately on mount
    const savedLang = localStorage.getItem('ballotlens_lang') as LanguageName | null;
    document.documentElement.setAttribute('lang', savedLang ?? 'en');

    // Check for demo mode first
    const demoFlag = localStorage.getItem('ballotlens_demo') === 'true';
    if (demoFlag) {
      setIsDemo(true);
      setUser({ id: 'demo-user', email: 'demo@ballotlens.app' } as unknown as User);
      setProfile({ id: 'demo-user', full_name: 'Demo Voter', zip_code: '33101', is_admin: false, language_preference: 'en' });
      setLoading(false);
      return;
    }

    // Initial session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes — wrap async work to avoid deadlock
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        (async () => {
          await loadProfile(newSession.user.id);
        })();
      } else {
        setProfile(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = error.message || '';
      if (error.name === 'AuthRetryableFetchError' || msg.includes('fetch') || msg.includes('Failed to fetch') || !msg) {
        return { error: 'Unable to connect to the authentication service. Please try again in a moment.' };
      }
      if (msg.includes('Email not confirmed')) {
        return { error: 'Please confirm your email before signing in. Check your inbox for a confirmation link.' };
      }
      if (msg.includes('Invalid login credentials')) {
        return { error: 'Incorrect email or password. Please try again.' };
      }
      return { error: msg };
    }
    return { error: null };
  };

  const signUp: AuthContextValue['signUp'] = async (email, password, fullName, language) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, language_preference: language ?? 'en' } },
    });
    if (error) {
      const msg = error.message || '';
      if (error.name === 'AuthRetryableFetchError' || msg.includes('fetch') || msg.includes('Failed to fetch') || !msg) {
        return { error: 'Unable to connect to the authentication service. Please try again in a moment.' };
      }
      return { error: msg };
    }
    // If email confirmation is required, there's no session yet
    if (!data.session) {
      return { error: 'Check your email for a confirmation link to finish creating your account.' };
    }
    return { error: null };
  };

  const signInAsDemo = () => {
    localStorage.setItem('ballotlens_demo', 'true');
    setIsDemo(true);
    setUser({ id: 'demo-user', email: 'demo@ballotlens.app' } as unknown as User);
    setProfile({ id: 'demo-user', full_name: 'Demo Voter', zip_code: '33101', is_admin: false, language_preference: 'en' });
  };

  const signOut = async () => {
    if (isDemo) {
      localStorage.removeItem('ballotlens_demo');
      setIsDemo(false);
      setUser(null);
      setProfile(null);
      return;
    }
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id);
  };

  const setLanguage: AuthContextValue['setLanguage'] = async (language) => {
    // Update localStorage + DOM immediately for instant feedback
    localStorage.setItem('ballotlens_lang', language);
    document.documentElement.setAttribute('lang', language);

    // Update profile in DB if signed in (skip for demo mode)
    if (user && !isDemo) {
      await supabase
        .from('profiles')
        .update({ language_preference: language })
        .eq('id', user.id);
    }
    setProfile((prev) => prev ? { ...prev, language_preference: language } : prev);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, isDemo, signIn, signUp, signInAsDemo, signOut, refreshProfile, setLanguage }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
