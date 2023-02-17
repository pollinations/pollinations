import Debug from "debug"
import { useEffect, useState } from "react"
import { Navigate, Route, Routes, useParams } from "react-router"
import { BrowserRouter } from "react-router-dom"
import Footer from "./components/Footer"
import { SEOMetadata } from "./components/Helmet"
import PageTemplate from "./components/PageTemplate"
// Components
import TopBar from "./components/TopBar"
// Pages
import Home from "./pages/Home/"
import Models from "./pages/Models"
import About from "./pages/About"
import Integrate from "./pages/Integrate"
import {
  MAIN_NAV_ROUTES, MARKDOWN_ROUTES
} from "./routes/publicRoutes"
import ScrollToTop from './utils/ScrollToTop'

import Showcase3d from "./pages/3dShowcase"
import CreateModel from './pages/Create/'
import DashBoard from './pages/Dashboard'
import LoginPage from "./pages/Login"
import { getCurrentUser } from "./supabase/user"
import ProtectedRoute from "./routes/protectedRoute"
import { useAuth } from "./hooks/useAuth"

const debug = Debug("AppContainer")


const App = () => (
  <BrowserRouter>
    <ScrollToTop>
      <Pollinations />
    </ScrollToTop>
  </BrowserRouter>
)


const Pollinations = () => {

  // const { user } = useAuth()

  const isUser = false;

  return ( <>
    <SEOMetadata/>
      
    <TopBar isUser={isUser}  />

    <Routes>
      <Route exact path='/' element={<Home />} />
      <Route exact path='about' element={<About/>}/>
      <Route exact path='integrate' element={<Integrate/>}/>
      <Route exact path='3d' element={<Showcase3d/>}/>

      {
        MARKDOWN_ROUTES.map( route => (
          <Route 
            key={route.id}
            exact
            path={route.to}
            element={<PageTemplate label={route.id} />}
          />
        ))
      }

      <Route path="c/:selected" element={<Models />} />

      {/* Create with our GPU */}
      <Route path="create" element={<CreateModel />} >
        {/* Disco, majesty, etc... */}
        <Route path=':Model'>
          {/* Hash associated with the content created */}
          <Route path=':nodeID' />
        </Route>
      </Route>
      {/* Register a path that redirects to a url which is passed just after */}
      <Route path="redirect/*" element={<Redirect />} />
      
      <Route exact path='login' element={<LoginPage/>}/>
      <Route exact path='c' element={<Navigate replace to="Anything" />} />
      <Route exact path='temp' element={<DashBoard/>}/>

      <Route path="*" element={<Navigate to="/" replace={true} />}/>
      
    </Routes>
      
    <Footer />
  </>
  )
}

const Redirect = () => {

  const { '*': url} = useParams()

  useEffect(() => {
    window.location.href = url
  }, [url])

  return <div style={{padding:"40px"}}> <br /> <br /> <br /> <br /> <br /> <h2>Redirecting to Google Colab...</h2></div>
}

export default App
