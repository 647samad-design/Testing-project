import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider } from '@/hooks/use-auth';
import { Header, Footer } from '@/components/shared/Layout';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { LoadingState } from '@/components/shared/StateComponents';
import { LandingPage } from '@/pages/LandingPage';
import { MyBallotPage } from '@/pages/MyBallotPage';
import { CandidatesPage } from '@/pages/CandidatesPage';
import { CandidateProfilePage } from '@/pages/CandidateProfilePage';
import { IssuesPage } from '@/pages/IssuesPage';
import { ComparePage } from '@/pages/ComparePage';
import { NewsPage } from '@/pages/NewsPage';
import { AskBallotLensPage } from '@/pages/AskBallotLensPage';
import { SignInPage } from '@/pages/SignInPage';
import { AccountPage } from '@/pages/AccountPage';
import { AdvertisingPage } from '@/pages/AdvertisingPage';
import { StoriesPage, StoryDetailPage } from '@/pages/StoriesPage';
import { FeedPage } from '@/pages/FeedPage';
import { LensThisPage } from '@/pages/LensThisPage';
import { ClaimsLibraryPage } from '@/pages/ClaimsLibraryPage';
import { OnboardingQuizPage } from '@/pages/OnboardingQuizPage';
import { CandidateQuizPage } from '@/pages/CandidateQuizPage';
import { PricingPage } from '@/pages/PricingPage';
import { MessagesPage } from '@/pages/MessagesPage';
import { ContestDetailPage, MeasureDetailPage } from '@/pages/ContestDetailPage';
import { PrivacyPolicyPage } from '@/pages/legal/PrivacyPolicyPage';
import { TermsOfServicePage } from '@/pages/legal/TermsOfServicePage';
import { DisclaimerPage } from '@/pages/legal/DisclaimerPage';
import { AboutPage } from '@/pages/company/AboutPage';
import { HowItWorksPage } from '@/pages/company/HowItWorksPage';
import { MethodologyPage } from '@/pages/company/MethodologyPage';
import { SourcesPage } from '@/pages/company/SourcesPage';
import { AccessibilityPage } from '@/pages/company/AccessibilityPage';
import { ContactPage } from '@/pages/company/ContactPage';
import { Toaster } from '@/components/ui/sonner';
import { ScrollToTop } from '@/components/shared/ScrollToTop';

// Code-split the pages only a small subset of visitors ever reach (admins,
// claimed candidates, advertisers) -- previously every voter's very first
// page load had to download all of these too, even though the overwhelming
// majority of visitors are voters who never touch them. This keeps the
// bundle every voter pays for on their first visit meaningfully smaller.
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
              <Route path="*" element={<LandingPage />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </main>
          <Footer />
        </div>
        <Toaster />
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
