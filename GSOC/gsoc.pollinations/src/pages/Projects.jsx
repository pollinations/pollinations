import '../styles/Projects.css'

export default function Projects() {
  const projects = [
    {
      id: 1,
      name: 'Project Name 1',
      organization: 'Organization A',
      description: 'Build amazing features and contribute to this groundbreaking open-source project.',
      topics: ['JavaScript', 'React', 'Web Development'],
      difficulty: 'Intermediate'
    },
    {
      id: 2,
      name: 'Project Name 2',
      organization: 'Organization B',
      description: 'Help improve performance and add new capabilities to this widely-used library.',
      topics: ['Python', 'Machine Learning', 'Data Science'],
      difficulty: 'Advanced'
    },
    {
      id: 3,
      name: 'Project Name 3',
      organization: 'Organization C',
      description: 'Enhance documentation, fix bugs, and implement new features for users worldwide.',
      topics: ['Go', 'Backend', 'DevOps'],
      difficulty: 'Beginner'
    },
    {
      id: 4,
      name: 'Project Name 4',
      organization: 'Organization D',
      description: 'Create intuitive UIs and improve user experience across multiple platforms.',
      topics: ['UI/UX', 'Design', 'Frontend'],
      difficulty: 'Intermediate'
    },
  ]

  return (
    <div className="projects">
      <div className="projects-header">
        <h1>Featured Projects</h1>
        <p>Explore and contribute to these exciting open-source initiatives</p>
      </div>

      <div className="projects-grid">
        {projects.map((project) => (
          <div key={project.id} className="project-card">
            <div className="project-header">
              <h3>{project.name}</h3>
              <span className={`difficulty difficulty-${project.difficulty.toLowerCase()}`}>
                {project.difficulty}
              </span>
            </div>
            <p className="project-org">{project.organization}</p>
            <p className="project-description">{project.description}</p>
            <div className="project-topics">
              {project.topics.map((topic, idx) => (
                <span key={idx} className="topic-tag">{topic}</span>
              ))}
            </div>
            <button className="btn btn-secondary">Learn More</button>
          </div>
        ))}
      </div>
    </div>
  )
}
