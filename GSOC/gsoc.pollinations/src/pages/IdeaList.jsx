export default function IdeaList() {
  const ideas = [
    {
      id: 1,
      title: 'AI-Powered Code Review System',
      organization: 'Pollinations AI',
      description: 'Build an intelligent code review assistant that uses machine learning to identify bugs, suggest improvements, and provide architectural insights.',
      skills: ['Python', 'Machine Learning', 'NLP'],
      difficulty: 'Advanced',
      mentors: ['Dr. Sarah Chen', 'Alex Rodriguez'],
      expectedOutcome: 'A fully functional code review plugin with integration capabilities'
    },
    {
      id: 2,
      title: 'Real-time Collaborative Editing Platform',
      organization: 'Pollinations Network',
      description: 'Create a high-performance collaborative document editor with real-time synchronization, conflict resolution, and rich media support.',
      skills: ['JavaScript', 'WebSockets', 'React'],
      difficulty: 'Intermediate',
      mentors: ['Emma Thompson'],
      expectedOutcome: 'Production-ready collaborative editing system with security features'
    },
    {
      id: 3,
      title: 'Multi-language Documentation Generator',
      organization: 'Pollinations Docs',
      description: 'Develop an automated tool to generate comprehensive documentation in multiple languages with code examples and API reference.',
      skills: ['JavaScript', 'Documentation', 'Automation'],
      difficulty: 'Intermediate',
      mentors: ['James Wilson'],
      expectedOutcome: 'CLI tool generating professional documentation from source code'
    },
    {
      id: 4,
      title: 'Performance Analytics Dashboard',
      organization: 'Pollinations Analytics',
      description: 'Build a comprehensive dashboard for monitoring application performance metrics, with real-time alerts and historical analysis capabilities.',
      skills: ['React', 'Data Visualization', 'Backend'],
      difficulty: 'Intermediate',
      mentors: ['Lisa Park', 'Michael Johnson'],
      expectedOutcome: 'Scalable dashboard handling millions of data points daily'
    },
    {
      id: 5,
      title: 'Privacy-First Analytics SDK',
      organization: 'Pollinations Privacy',
      description: 'Create a lightweight SDK for collecting user analytics while maintaining privacy compliance with GDPR, CCPA, and other regulations.',
      skills: ['TypeScript', 'Security', 'Backend'],
      difficulty: 'Advanced',
      mentors: ['Dr. Robert Kim'],
      expectedOutcome: 'SDK with <5KB bundle size and full privacy compliance'
    },
    {
      id: 6,
      title: 'Container Orchestration CLI',
      organization: 'Pollinations DevOps',
      description: 'Build a command-line tool for managing containerized applications with automatic scaling, health checks, and deployment strategies.',
      skills: ['Go', 'Docker', 'Kubernetes'],
      difficulty: 'Advanced',
      mentors: ['David Martinez'],
      expectedOutcome: 'Production-grade CLI tool managing container infrastructure'
    },
    {
      id: 7,
      title: 'Mobile-First Design System',
      organization: 'Pollinations Design',
      description: 'Create a comprehensive design system with reusable components, accessibility features, and cross-platform consistency.',
      skills: ['React Native', 'Design', 'CSS'],
      difficulty: 'Intermediate',
      mentors: ['Sophie Anderson'],
      expectedOutcome: 'Complete design system with 50+ components and accessibility certification'
    },
    {
      id: 8,
      title: 'Open Source Vulnerability Scanner',
      organization: 'Pollinations Security',
      description: 'Develop a security scanner that identifies vulnerabilities in open-source dependencies with actionable remediation suggestions.',
      skills: ['Python', 'Security', 'Data Processing'],
      difficulty: 'Advanced',
      mentors: ['Dr. Helen Foster'],
      expectedOutcome: 'Production-ready scanner detecting 95%+ of known vulnerabilities'
    }
  ]

  const getDifficultyColor = (difficulty) => {
    switch(difficulty) {
      case 'Beginner': return 'bg-green-100 text-green-800'
      case 'Intermediate': return 'bg-blue-100 text-blue-800'
      case 'Advanced': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Project Ideas for GSOC 2026
          </h1>
          <p className="text-xl text-gray-600">
            Explore exciting project proposals from mentoring organizations. Find the perfect match for your skills and interests.
          </p>
        </div>
      </section>

      {/* Projects Grid */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid gap-6">
            {ideas.map((idea) => (
              <div key={idea.id} className="border border-gray-200 rounded-lg p-8 hover:shadow-lg transition">
                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      {idea.title}
                    </h3>
                    <p className="text-blue-600 font-semibold">
                      {idea.organization}
                    </p>
                  </div>
                  <div className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${getDifficultyColor(idea.difficulty)}`}>
                    {idea.difficulty}
                  </div>
                </div>

                <p className="text-gray-700 mb-6 leading-relaxed">
                  {idea.description}
                </p>

                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Required Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {idea.skills.map((skill, i) => (
                      <span key={i} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6 pt-6 border-t border-gray-200">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Mentors</h4>
                    <ul className="space-y-1">
                      {idea.mentors.map((mentor, i) => (
                        <li key={i} className="text-gray-600 flex items-center gap-2">
                          <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                          {mentor}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Expected Outcome</h4>
                    <p className="text-gray-600">{idea.expectedOutcome}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Found an interesting project?
          </h2>
          <p className="text-gray-600 mb-8">
            Check back regularly as more organizations and projects will be added as we approach the application period.
          </p>
          <button className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
            Subscribe for Updates
          </button>
        </div>
      </section>
    </div>
  )
}
