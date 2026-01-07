import { Link } from 'react-router-dom'
import viteLogo from '/vite.svg'
import '../styles/Navigation.css'

export default function Navigation() {
  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          <img src={viteLogo} alt="GSOC Logo" className="logo-img" />
          <span>GSOC</span>
        </Link>
        <ul className="nav-menu">
          <li className="nav-item">
            <Link to="/" className="nav-link">
              Home
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/projects" className="nav-link">
              Projects
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/mentors" className="nav-link">
              Mentors
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/about" className="nav-link">
              About
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  )
}
