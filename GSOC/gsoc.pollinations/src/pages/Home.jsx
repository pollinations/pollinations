import { Link } from 'react-router-dom'
import viteLogo from '/vite.svg'
import '../styles/Home.css'

export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-content">
          <img src={viteLogo} alt="GSOC" className="hero-logo" />
          <h1>Google Summer of Code</h1>
          <p className="hero-subtitle">
            Building the Future of Open Source
          </p>
          <p className="hero-description">
            Discover innovative projects, connect with experienced mentors, and make an impact on the open-source community.
          </p>
          <div className="hero-buttons">
            <Link to="/projects" className="btn btn-primary">
              Explore Projects
            </Link>
            <Link to="/mentors" className="btn btn-secondary">
              Meet Our Mentors
            </Link>
          </div>
        </div>
      </section>

      <section className="features">
        <h2>Why GSOC?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🚀</div>
            <h3>Real-World Projects</h3>
            <p>Work on meaningful open-source projects that impact millions of users worldwide.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">👨‍🏫</div>
            <h3>Expert Mentorship</h3>
            <p>Learn from experienced developers and industry leaders in the open-source community.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💰</div>
            <h3>Competitive Stipends</h3>
            <p>Earn competitive stipends for your contributions during the summer.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🌍</div>
            <h3>Global Community</h3>
            <p>Connect with talented developers and mentors from around the world.</p>
          </div>
        </div>
      </section>

      <section className="cta">
        <h2>Ready to Make an Impact?</h2>
        <p>Join thousands of developers contributing to open-source projects</p>
        <Link to="/projects" className="btn btn-primary btn-large">
          Get Started Now
        </Link>
      </section>
    </div>
  )
}
