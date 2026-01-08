import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import Footer from './components/Footer'
import LandingPage from './pages/Home'
import MentorList from './pages/Mentors'
import IdeaList from './pages/IdeaList'
import About from './pages/About'

function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col h-full w-full  min-h-screen">
        <Navigation />
        <main className="grow">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/mentors" element={<MentorList />} />
            <Route path="/ideas" element={<IdeaList />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
