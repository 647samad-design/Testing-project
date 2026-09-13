import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/hooks/use-auth';
import { Header, Footer } from '@/components/shared/Layout';
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
import { AdminDashboardPage } from '@/pages/AdminDashboardPage';
import { AdvertisingPage } from '@/pages/AdvertisingPage';
import { StoriesPage, StoryDetailPage } from '@/pages/StoriesPage';
import { CandidatePortalPage } from '@/pages/CandidatePortalPage';
import { FeedPage } from '@/pages/FeedPage';
import { LensThisPage } from '@/pages/LensThisPage';
import { OnboardingQuizPage } from '@/pages/OnboardingQuizPage';
import { CandidateQuizPage } from '@/pages/CandidateQuizPage';
import { PricingPage } from '@/pages/PricingPage';
import { MessagesPage } from '@/pages/MessagesPage';
import { ContestDetailPage, MeasureDetailPage } from '@/pages/ContestDetailPage';
import { PrivacyPolicyPage } from '@/pages/legal/PrivacyPolicyPage';
import { TermsOfServicePage } from '@/pages/legal/TermsOfServicePage';
import { DisclaimerPage } from '@/pages/legal/DisclaimerPage';
import { Toaster } from '@/components/ui/sonner';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">
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
              <Route path="/candidate-portal" element={<CandidatePortalPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/stories" element={<StoriesPage />} />
              <Route path="/stories/:slug" element={<StoryDetailPage />} />
              <Route path="/feed" element={<FeedPage />} />
              <Route path="/lens" element={<LensThisPage />} />
              <Route path="/onboarding" element={<OnboardingQuizPage />} />
              <Route path="/candidate-quiz" element={<CandidateQuizPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsOfServicePage />} />
              <Route path="/disclaimer" element={<DisclaimerPage />} />
              <Route path="*" element={<LandingPage />} />
            </Routes>
          </main>
          <Footer />
        </div>
        <Toaster />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
