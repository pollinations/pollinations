import '../styles/About.css'

export default function About() {
  return (
    <div className="about">
      <section className="about-hero">
        <h1>About GSOC</h1>
        <p className="about-subtitle">Empowering the next generation of developers</p>
      </section>

      <section className="about-content">
        <div className="about-section">
          <h2>What is Google Summer of Code?</h2>
          <p>
            Google Summer of Code is a global program focused on bringing more student developers into open source software development. Students work with an open source organization on a 12+ week programming project during their break from school.
          </p>
        </div>

        <div className="about-section">
          <h2>Our Mission</h2>
          <p>
            We believe in the power of open-source software and the importance of mentorship. Our mission is to connect passionate developers with meaningful projects, experienced mentors, and a supportive global community. Together, we're building the future of technology.
          </p>
        </div>

        <div className="about-section">
          <h2>Why Participate?</h2>
          <ul className="benefits-list">
            <li>💼 <strong>Real-World Experience:</strong> Work on projects used by millions</li>
            <li>👨‍🏫 <strong>Expert Mentorship:</strong> Learn from industry leaders</li>
            <li>💰 <strong>Competitive Stipends:</strong> Get paid for your contributions</li>
            <li>🌍 <strong>Global Network:</strong> Connect with developers worldwide</li>
            <li>📚 <strong>Skill Development:</strong> Enhance your programming abilities</li>
            <li>🎯 <strong>Career Growth:</strong> Build your professional portfolio</li>
          </ul>
        </div>

        <div className="about-section">
          <h2>Statistics</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>20+</h3>
              <p>Years of Impact</p>
            </div>
            <div className="stat-card">
              <h3>22K+</h3>
              <p>Developers Supported</p>
            </div>
            <div className="stat-card">
              <h3>3K+</h3>
              <p>Projects Participated</p>
            </div>
            <div className="stat-card">
              <h3>100+</h3>
              <p>Countries Represented</p>
            </div>
          </div>
        </div>

        <div className="about-section">
          <h2>Timeline</h2>
          <div className="timeline">
            <div className="timeline-item">
              <h4>Spring</h4>
              <p>Organizations apply to participate</p>
            </div>
            <div className="timeline-item">
              <h4>Late Spring</h4>
              <p>Student application period opens</p>
            </div>
            <div className="timeline-item">
              <h4>Summer</h4>
              <p>Students work on projects with mentors</p>
            </div>
            <div className="timeline-item">
              <h4>Fall</h4>
              <p>Final evaluations and celebrations</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
