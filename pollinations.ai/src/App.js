import { Navigate, Route, Routes, useSearchParams, useEffect } from "react-router"
import { SEOMetadata } from "./components/Helmet"
import Header from "./Home/Header"
import Footer from "./Home/Footer"
import Home from "./Home"
import Terms from "./Home/Terms"
import { trackEvent } from "./config/analytics"

const ReferralRedirect = () => {
  const [searchParams] = useSearchParams();
  const topic = searchParams.get('topic');

  useEffect(() => {
    // Track the referral event
    trackEvent({
      action: 'referral_visit',
      category: 'referral',
      label: topic || 'unknown',
    });

    // Redirect to home page after tracking
    window.location.href = 'https://pollinations.ai';
  }, [topic]);

  return null; // Component doesn't render anything
};

const AppRoutes = [
  {
    exact: true,
    path: "/",
    element: <Home />,
    key: "home",
  },
  {
    exact: true,
    path: "/terms",
    element: <Terms />,
    key: "terms",
  },
  {
    exact: true,
    path: "/referral",
    element: <ReferralRedirect />,
    key: "referral",
  },
  {
    path: "*",
    element: <Navigate to="/" replace={true} />,
    key: "404",
  },
]

const App = () => (
  <>
    <SEOMetadata />
    <Header />
    <Routes>
      {AppRoutes.map(({ key, ...route }) => (
        <Route key={key} {...route} />
      ))}
    </Routes>
    <Footer />
  </>
)

export default App
