import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { I18nProvider } from '@/i18n';
import { AuthProvider } from '@/hooks/use-auth';
import { Header, Footer } from '@/components/shared/Layout';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { LoadingState } from '@/components/shared/StateComponents';
import { LandingPage } from '@/pages/LandingPage';
import { Toaster } from '@/components/ui/sonner';
import { ScrollToTop } from '@/components/shared/ScrollToTop';

// Code-split the pages only a small subset of visitors ever reach (admins,
// claimed candidates, advertisers) -- previously every voter's very first
// page load had to download all of these too, even though the overwhelming
// majority of visitors are voters who never touch them. This keeps the
// bundle every voter pays for on their first visit meaningfully smaller.
// Every page except the landing page loads on demand, so a first visit
// downloads only what that screen needs (the main bundle was ~1 MB).
const MyBallotPage = lazy(() => import('@/pages/MyBallotPage').then((m) => ({ default: m.MyBallotPage })));
const CandidatesPage = lazy(() => import('@/pages/CandidatesPage').then((m) => ({ default: m.CandidatesPage })));
const CandidateProfilePage = lazy(() => import('@/pages/CandidateProfilePage').then((m) => ({ default: m.CandidateProfilePage })));
const IssuesPage = lazy(() => import('@/pages/IssuesPage').then((m) => ({ default: m.IssuesPage })));
const ComparePage = lazy(() => import('@/pages/ComparePage').then((m) => ({ default: m.ComparePage })));
const NewsPage = lazy(() => import('@/pages/NewsPage').then((m) => ({ default: m.NewsPage })));
const AskBallotLensPage = lazy(() => import('@/pages/AskBallotLensPage').then((m) => ({ default: m.AskBallotLensPage })));
const SignInPage = lazy(() => import('@/pages/SignInPage').then((m) => ({ default: m.SignInPage })));
const AccountPage = lazy(() => import('@/pages/AccountPage').then((m) => ({ default: m.AccountPage })));
const AdvertisingPage = lazy(() => import('@/pages/AdvertisingPage').then((m) => ({ default: m.AdvertisingPage })));
const FeedPage = lazy(() => import('@/pages/FeedPage').then((m) => ({ default: m.FeedPage })));
const LensThisPage = lazy(() => import('@/pages/LensThisPage').then((m) => ({ default: m.LensThisPage })));
const ClaimsLibraryPage = lazy(() => import('@/pages/ClaimsLibraryPage').then((m) => ({ default: m.ClaimsLibraryPage })));
const OnboardingQuizPage = lazy(() => import('@/pages/OnboardingQuizPage').then((m) => ({ default: m.OnboardingQuizPage })));
const CandidateQuizPage = lazy(() => import('@/pages/CandidateQuizPage').then((m) => ({ default: m.CandidateQuizPage })));
const PricingPage = lazy(() => import('@/pages/PricingPage').then((m) => ({ default: m.PricingPage })));
const MessagesPage = lazy(() => import('@/pages/MessagesPage').then((m) => ({ default: m.MessagesPage })));
const PrivacyPolicyPage = lazy(() => import('@/pages/legal/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage })));
const TermsOfServicePage = lazy(() => import('@/pages/legal/TermsOfServicePage').then((m) => ({ default: m.TermsOfServicePage })));
const DisclaimerPage = lazy(() => import('@/pages/legal/DisclaimerPage').then((m) => ({ default: m.DisclaimerPage })));
const AboutPage = lazy(() => import('@/pages/company/AboutPage').then((m) => ({ default: m.AboutPage })));
const HowItWorksPage = lazy(() => import('@/pages/company/HowItWorksPage').then((m) => ({ default: m.HowItWorksPage })));
const MethodologyPage = lazy(() => import('@/pages/company/MethodologyPage').then((m) => ({ default: m.MethodologyPage })));
const SourcesPage = lazy(() => import('@/pages/company/SourcesPage').then((m) => ({ default: m.SourcesPage })));
const AccessibilityPage = lazy(() => import('@/pages/company/AccessibilityPage').then((m) => ({ default: m.AccessibilityPage })));
const UnsubscribePage = lazy(() => import('@/pages/UnsubscribePage').then((m) => ({ default: m.UnsubscribePage })));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const ContactPage = lazy(() => import('@/pages/company/ContactPage').then((m) => ({ default: m.ContactPage })));
const StoriesPage = lazy(() => import('@/pages/StoriesPage').then((m) => ({ default: m.StoriesPage })));
const StoryDetailPage = lazy(() => import('@/pages/StoriesPage').then((m) => ({ default: m.StoryDetailPage })));
const ContestDetailPage = lazy(() => import('@/pages/ContestDetailPage').then((m) => ({ default: m.ContestDetailPage })));
const MeasureDetailPage = lazy(() => import('@/pages/ContestDetailPage').then((m) => ({ default: m.MeasureDetailPage })));
const AdminDashboardPage = lazy(() => import('@/pages/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const AdvertiserDashboardPage = lazy(() => import('@/pages/AdvertiserDashboardPage').then((m) => ({ default: m.AdvertiserDashboardPage })));
const CandidatePortalPage = lazy(() => import('@/pages/CandidatePortalPage').then((m) => ({ default: m.CandidatePortalPage })));

function LazyPageFallback() {
  return (
    <div className="mx-auto max-w-content px-4 py-16">
      <LoadingState message="Loading…" />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <I18nProvider>
      <BrowserRouter>
        <ScrollToTop />
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">
            <ErrorBoundary>
              <Suspense fallback={<LazyPageFallback />}>
              <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/ballot" element={<MyBallotPage />} />
              <Route path="/ballot/:contestId" element={<ContestDetailPage />} />
              <Route path="/ballot/measure/:measureId" element={<MeasureDetailPage />} />
              <Route path="/candidates" element={<CandidatesPage />} />
              <Route path="/candidates/:candidateId" element={<CandidateProfilePage />} />
              <Route path="/issues" element={<IssuesPage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/ask" element={<AskBallotLensPage />} />
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/advertise" element={<AdvertisingPage />} />
              <Route path="/advertiser-dashboard" element={<AdvertiserDashboardPage />} />
              <Route path="/candidate-portal" element={<CandidatePortalPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/stories" element={<StoriesPage />} />
              <Route path="/stories/:slug" element={<StoryDetailPage />} />
              <Route path="/feed" element={<FeedPage />} />
              <Route path="/lens" element={<LensThisPage />} />
              <Route path="/claims" element={<ClaimsLibraryPage />} />
              <Route path="/onboarding" element={<OnboardingQuizPage />} />
              <Route path="/candidate-quiz" element={<CandidateQuizPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsOfServicePage />} />
              <Route path="/disclaimer" element={<DisclaimerPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/how-it-works" element={<HowItWorksPage />} />
              <Route path="/methodology" element={<MethodologyPage />} />
              <Route path="/sources" element={<SourcesPage />} />
              <Route path="/accessibility" element={<AccessibilityPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/unsubscribe" element={<UnsubscribePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </main>
          <Footer />
        </div>
        <Toaster />
      </BrowserRouter>
      </I18nProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
