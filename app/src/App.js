import { Navigate, Route, Routes } from "react-router"
import { SEOMetadata } from "./components/Helmet"
import PageTemplate from "./components/PageTemplate"
import TopBar from "./components/TopBar"
import Footer from "./components/Footer"
import Home from "./pages/Solutions/"

const App = () => <>
  <SEOMetadata/>
  <TopBar />
  <Routes>
    <Route exact path='/' element={<Home />} />
    <Route exact path='/impressum' element={<PageTemplate label='impressum'/>} />
    <Route path="*" element={<Navigate to="/" replace={true} />}/>
  </Routes>
  <Footer />
</>;

export default App
