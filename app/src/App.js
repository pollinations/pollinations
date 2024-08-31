import { Navigate, Route, Routes } from "react-router"
import { SEOMetadata } from "./components/Helmet"
import MarkdownTemplate from "./components/MarkdownTemplate"
import TopBar from "./components/TopBar"
import Footer from "./components/Footer"
import Home from "./pages/Home/"
import AsciiArtGenerator from "./components/AsciiArtGenerator"

const AppRoutes = [
  {
    exact: true,
    path: '/',
    element: <Home />,
    key: 'home'
  },
  {
    exact: true,
    path: '/impressum',
    element: <MarkdownTemplate label='impressum' />,
    key: 'impressum'
  },
  {
    exact: true,
    path: '/terms',
    element: <MarkdownTemplate label='terms' />,
    key: 'terms'
  },
  {
    exact: true,
    path: '/readme',
    element: <MarkdownTemplate label='readme' />,
    key: 'readme'
  },
  {
    path: '*',
    element: <Navigate to="/" replace={true} />,
    key: '404'
  },
]

const App = () => <>
  <SEOMetadata />
  <TopBar />
  <Routes>
    {
      AppRoutes.map(route => <Route {...route} />)
    }
  </Routes>
  <Footer />
  <AsciiArtGenerator />
</>;

export default App
