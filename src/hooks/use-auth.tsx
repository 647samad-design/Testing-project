import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { edgeFunctionErrorMessage } from '@/lib/edge-function-error';
import type { Profile, LanguageName } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isDemo: boolean;
  isPasswordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, language?: LanguageName) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  deleteAccount: () => Promise<{ error: string | null }>;
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
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      // Every profile field the app reads. This used to fetch only id, name,
      // zip, is_admin and language -- so photo_url, bio, occupation and
      // education were saved but never loaded back: the Account page showed
      // them empty (photo reverted to initials right after a successful
      // upload), and the next Save overwrote the stored values with blanks.
      .select('id, full_name, zip_code, is_admin, role, language_preference, photo_url, bio, occupation, education, civic_level, civic_xp, created_at')
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

    // A real session always wins over demo mode. Demo mode used to be checked
    // first and return early, so once "Explore as Demo User" had been used in a
    // browser, signing in with a real account still showed the demo profile
    // (and disabled real actions like photo upload) until demo was exited.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        localStorage.removeItem('ballotlens_demo');
        setIsDemo(false);
        setSession(data.session);
        setUser(data.session.user);
        loadProfile(data.session.user.id).finally(() => setLoading(false));
        return;
      }
      if (localStorage.getItem('ballotlens_demo') === 'true') {
        setIsDemo(true);
        setUser({ id: 'demo-user', email: 'demo@ballotlens.app' } as unknown as User);
        setProfile({ id: 'demo-user', full_name: 'Demo Voter', zip_code: '33101', is_admin: false, language_preference: 'en' });
        setLoading(false);
        return;
      }
      setSession(null);
      setUser(null);
      setLoading(false);
    });

    // Listen for auth changes — wrap async work to avoid deadlock
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (_event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (!newSession?.user && localStorage.getItem('ballotlens_demo') === 'true') return; // stay in demo
      if (newSession?.user) { localStorage.removeItem('ballotlens_demo'); setIsDemo(false); }
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

  const resetPassword: AuthContextValue['resetPassword'] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/signin?type=recovery`,
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  const updatePassword: AuthContextValue['updatePassword'] = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return { error: null };
  };

  const deleteAccount: AuthContextValue['deleteAccount'] = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('delete-my-account');
      if (error) return { error: await edgeFunctionErrorMessage(error, 'Failed to delete account.') };
      if (data?.error) return { error: data.error };
      await supabase.auth.signOut();
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to delete account.' };
    }
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
      value={{ session, user, profile, loading, isDemo, isPasswordRecovery, signIn, signUp, resetPassword, updatePassword, deleteAccount, signInAsDemo, signOut, refreshProfile, setLanguage }}
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
