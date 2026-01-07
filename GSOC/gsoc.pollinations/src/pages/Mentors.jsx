import '../styles/Mentors.css'

export default function Mentors() {
  const mentors = [
    {
      id: 1,
      name: 'Mentor Name 1',
      role: 'Senior Developer',
      organization: 'Organization A',
      expertise: ['JavaScript', 'React', 'Full-Stack'],
      bio: 'Passionate about open-source and helping new developers grow their skills.'
    },
    {
      id: 2,
      name: 'Mentor Name 2',
      role: 'ML Engineer',
      organization: 'Organization B',
      expertise: ['Python', 'Machine Learning', 'Data Science'],
      bio: 'Dedicated to making AI/ML accessible and contributing to cutting-edge research.'
    },
    {
      id: 3,
      name: 'Mentor Name 3',
      role: 'DevOps Specialist',
      organization: 'Organization C',
      expertise: ['Go', 'Kubernetes', 'Cloud Infrastructure'],
      bio: 'Expert in building scalable systems and mentoring junior engineers.'
    },
    {
      id: 4,
      name: 'Mentor Name 4',
      role: 'Product Designer',
      organization: 'Organization D',
      expertise: ['UI/UX Design', 'User Research', 'Accessibility'],
      bio: 'Creating beautiful and intuitive user experiences for millions of users.'
    },
    {
      id: 5,
      name: 'Mentor Name 5',
      role: 'Backend Architect',
      organization: 'Organization E',
      expertise: ['System Design', 'Databases', 'Microservices'],
      bio: 'Building robust systems at scale and mentoring the next generation of engineers.'
    },
    {
      id: 6,
      name: 'Mentor Name 6',
      role: 'Security Expert',
      organization: 'Organization F',
      expertise: ['Security', 'Cryptography', 'DevSecOps'],
      bio: 'Making the internet safer, one project at a time.'
    },
  ]

  return (
    <div className="mentors">
      <div className="mentors-header">
        <h1>Meet Our Mentors</h1>
        <p>Learn from industry experts and experienced open-source contributors</p>
      </div>

      <div className="mentors-grid">
        {mentors.map((mentor) => (
          <div key={mentor.id} className="mentor-card">
            <div className="mentor-avatar">
              <div className="avatar-placeholder">{mentor.name.charAt(0)}</div>
            </div>
            <h3>{mentor.name}</h3>
            <p className="mentor-role">{mentor.role}</p>
            <p className="mentor-org">{mentor.organization}</p>
            <p className="mentor-bio">{mentor.bio}</p>
            <div className="mentor-expertise">
              {mentor.expertise.map((skill, idx) => (
                <span key={idx} className="expertise-tag">{skill}</span>
              ))}
            </div>
            <button className="btn btn-secondary btn-small">Contact</button>
          </div>
        ))}
      </div>
    </div>
  )
}
