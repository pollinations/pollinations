export default function MentorList() {
  const mentors = [
    {
      id: 1,
      name: 'Dr. Sarah Chen',
      title: 'AI Research Lead',
      organization: 'Pollinations AI',
      expertise: ['Machine Learning', 'NLP', 'Python'],
      bio: 'PhD in Computer Science with 10+ years in AI development. Published 20+ papers in top-tier conferences.',
      socials: { github: '#', twitter: '#' }
    },
    {
      id: 2,
      name: 'Emma Thompson',
      title: 'Senior Full-Stack Engineer',
      organization: 'Pollinations Network',
      expertise: ['JavaScript', 'WebSockets', 'System Design'],
      bio: 'Leading architect of real-time systems. Passionate about mentoring and open-source contribution.',
      socials: { github: '#', twitter: '#' }
    },
    {
      id: 3,
      name: 'James Wilson',
      title: 'Technical Writer & Developer',
      organization: 'Pollinations Docs',
      expertise: ['Documentation', 'Technical Writing', 'API Design'],
      bio: 'Believes great documentation is the foundation of successful projects. Author of 5 technical books.',
      socials: { github: '#', twitter: '#' }
    },
    {
      id: 4,
      name: 'Lisa Park',
      title: 'Data Engineer',
      organization: 'Pollinations Analytics',
      expertise: ['Big Data', 'Analytics', 'Data Visualization'],
      bio: 'Expertise in handling massive datasets at scale. Committed to making analytics accessible.',
      socials: { github: '#', twitter: '#' }
    },
    {
      id: 5,
      name: 'Michael Johnson',
      title: 'Backend Infrastructure Specialist',
      organization: 'Pollinations Analytics',
      expertise: ['Database Design', 'Backend Systems', 'Performance Optimization'],
      bio: '15+ years building systems that serve billions of requests daily.',
      socials: { github: '#', twitter: '#' }
    },
    {
      id: 6,
      name: 'Dr. Robert Kim',
      title: 'Security & Privacy Engineer',
      organization: 'Pollinations Privacy',
      expertise: ['Cybersecurity', 'Privacy Compliance', 'Cryptography'],
      bio: 'PhD in Security. Helping organizations build privacy-first solutions.',
      socials: { github: '#', twitter: '#' }
    },
    {
      id: 7,
      name: 'David Martinez',
      title: 'Cloud & DevOps Architect',
      organization: 'Pollinations DevOps',
      expertise: ['Kubernetes', 'Docker', 'CI/CD'],
      bio: 'Container and orchestration expert. Has managed infrastructure for millions of users.',
      socials: { github: '#', twitter: '#' }
    },
    {
      id: 8,
      name: 'Sophie Anderson',
      title: 'Design Systems Lead',
      organization: 'Pollinations Design',
      expertise: ['UI/UX Design', 'Design Systems', 'Accessibility'],
      bio: 'Creating design systems that scale. Advocate for inclusive and accessible design.',
      socials: { github: '#', twitter: '#' }
    },
    {
      id: 9,
      name: 'Alex Rodriguez',
      title: 'ML Engineer',
      organization: 'Pollinations AI',
      expertise: ['Deep Learning', 'Computer Vision', 'Model Deployment'],
      bio: 'Passionate about applying ML to real-world problems. Open-source enthusiast.',
      socials: { github: '#', twitter: '#' }
    },
    {
      id: 10,
      name: 'Dr. Helen Foster',
      title: 'Security Research Lead',
      organization: 'Pollinations Security',
      expertise: ['Vulnerability Research', 'Security Tools', 'Threat Analysis'],
      bio: 'PhD in Cybersecurity. Discovered 50+ CVEs. Building tools for the security community.',
      socials: { github: '#', twitter: '#' }
    }
  ]

  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Our Mentors
          </h1>
          <p className="text-xl text-gray-600">
            Learn from experienced engineers and thought leaders passionate about open-source development.
          </p>
        </div>
      </section>

      {/* Mentors Grid */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {mentors.map((mentor) => (
              <div key={mentor.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition">
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-32"></div>
                <div className="p-6">
                  <div className="text-center mb-4">
                    <h3 className="text-xl font-bold text-gray-900 mb-1">
                      {mentor.name}
                    </h3>
                    <p className="text-blue-600 font-semibold text-sm">
                      {mentor.title}
                    </p>
                    <p className="text-gray-600 text-sm">
                      {mentor.organization}
                    </p>
                  </div>

                  <p className="text-gray-600 text-sm mb-4 text-center leading-relaxed">
                    {mentor.bio}
                  </p>

                  <div className="mb-4">
                    <div className="flex flex-wrap gap-2 justify-center">
                      {mentor.expertise.map((skill, i) => (
                        <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-center gap-4 pt-4 border-t border-gray-200">
                    <a href={mentor.socials.github} className="text-gray-600 hover:text-blue-600 transition">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                    </a>
                    <a href={mentor.socials.twitter} className="text-gray-600 hover:text-blue-600 transition">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2s9 5 20 5a9.5 9.5 0 00-9-5.5c4.75-2.45 7-7 7-11.667z"/>
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mentorship Benefits */}
      <section className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            What Our Mentors Offer
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="text-2xl">🎯</div>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Goal Setting & Planning</h3>
                <p className="text-gray-600">Help you set realistic goals and create actionable plans for your project.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="text-2xl">💡</div>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Technical Guidance</h3>
                <p className="text-gray-600">Provide code reviews, architecture advice, and technical problem-solving.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="text-2xl">🤝</div>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Community Connection</h3>
                <p className="text-gray-600">Connect you with the open-source community and industry professionals.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="text-2xl">📚</div>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Continuous Learning</h3>
                <p className="text-gray-600">Guide your growth with resources, best practices, and mentoring sessions.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
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
