import { Navigate, Route, Routes } from "react-router"
import { SEOMetadata } from "./components/Helmet"
import Header from "./Home/Header"
import Footer from "./Home/Footer"
import Home from "./Home"
import Terms from "./Home/Terms"

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
      {AppRoutes.map((route) => (
        <Route {...route} />
      ))}
    </Routes>
    <Footer />
  </>
)

export default App
