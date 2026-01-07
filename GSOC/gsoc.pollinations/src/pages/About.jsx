export default function About() {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-4">
            About Google Summer of Code
          </h1>
          <p className="text-xl opacity-90">
            Empowering the next generation of open-source developers worldwide
          </p>
        </div>
      </section>

      {/* What is GSOC */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">
                What is Google Summer of Code?
              </h2>
              <p className="text-gray-600 mb-4 leading-relaxed">
                Google Summer of Code is a global annual program introduced by Google in 2005. It aims to bring more developers into open-source software development by offering students the opportunity to contribute to real-world projects during the summer break.
              </p>
              <p className="text-gray-600 mb-4 leading-relaxed">
                Participants work with mentoring organizations over a 12+ week period, receiving guidance from experienced developers while making meaningful contributions to projects that impact millions of users worldwide.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Since its inception, the program has brought together over 19,000 students and 900+ organizations from more than 110 countries.
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <div className="text-5xl font-bold text-blue-600 mb-2">20+</div>
              <p className="text-gray-600 mb-6">Years of fostering open source</p>
              <div className="text-4xl font-bold text-blue-600 mb-2">19,000+</div>
              <p className="text-gray-600 mb-6">Student contributors</p>
              <div className="text-4xl font-bold text-blue-600 mb-2">900+</div>
              <p className="text-gray-600">Organizations involved</p>
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Values */}
      <section className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-12 text-center">
            Our Mission & Values
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-lg p-8 border border-gray-200">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Accessibility</h3>
              <p className="text-gray-600">
                Make open-source development accessible to everyone, regardless of background or experience level. We believe great ideas come from diverse perspectives.
              </p>
            </div>
            <div className="bg-white rounded-lg p-8 border border-gray-200">
              <div className="text-4xl mb-4">🤝</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Community</h3>
              <p className="text-gray-600">
                Foster a supportive community where developers of all levels can learn, collaborate, and grow together. The strength is in our collective efforts.
              </p>
            </div>
            <div className="bg-white rounded-lg p-8 border border-gray-200">
              <div className="text-4xl mb-4">💡</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Impact</h3>
              <p className="text-gray-600">
                Create meaningful impact on the open-source ecosystem while providing real-world experience and mentorship to the next generation of developers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Participate */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-12 text-center">
            Why Participate in GSOC?
          </h2>
          <div className="space-y-6">
            <div className="flex gap-6">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-600 text-white">
                  <span className="text-2xl">💼</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Real-World Experience
                </h3>
                <p className="text-gray-600">
                  Contribute to projects used by millions worldwide. Gain practical experience that looks impressive on your resume and LinkedIn profile.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-600 text-white">
                  <span className="text-2xl">👨‍🏫</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Expert Mentorship
                </h3>
                <p className="text-gray-600">
                  Learn directly from experienced developers and thought leaders. Receive personalized guidance on technical skills and career development.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-600 text-white">
                  <span className="text-2xl">💰</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Competitive Compensation
                </h3>
                <p className="text-gray-600">
                  Earn competitive stipends ($1,500 - $6,600 depending on location). Get paid while working on meaningful projects and improving your skills.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-600 text-white">
                  <span className="text-2xl">🌍</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Global Network
                </h3>
                <p className="text-gray-600">
                  Connect with developers from 110+ countries. Build professional relationships and friendships with people who share your passion for open source.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-600 text-white">
                  <span className="text-2xl">🎓</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Portfolio Building
                </h3>
                <p className="text-gray-600">
                  Build a strong portfolio with contributions to professional open-source projects. Your work is visible to the entire tech community.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For Organizations */}
      <section className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-12 text-center">
            For Mentoring Organizations
          </h2>
          <p className="text-lg text-gray-600 mb-8 text-center">
            GSOC offers organizations an excellent opportunity to identify and recruit talent while advancing their open-source projects.
          </p>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-lg p-8 border border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Benefits for Organizations</h3>
              <ul className="space-y-3 text-gray-600">
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  Access to talented student developers
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  Accelerate project development
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  Build community and increase contributions
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  Mentor the next generation
                </li>
              </ul>
            </div>
            <div className="bg-white rounded-lg p-8 border border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Mentorship Support</h3>
              <ul className="space-y-3 text-gray-600">
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  Resources for effective mentoring
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  Community support and networking
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  Official GSOC branding
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-600">✓</span>
                  Visibility in the open-source community
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-12 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <details className="bg-gray-50 rounded-lg p-6 cursor-pointer group">
              <summary className="font-bold text-gray-900 flex items-center gap-2">
                <span className="inline-block w-6 h-6 group-open:rotate-90 transition">▶</span>
                Who is eligible to participate?
              </summary>
              <p className="text-gray-600 mt-4 ml-8">
                You must be 18 years old or older and enrolled in an accredited school. Participants should have programming experience and interest in open-source development.
              </p>
            </details>

            <details className="bg-gray-50 rounded-lg p-6 cursor-pointer group">
              <summary className="font-bold text-gray-900 flex items-center gap-2">
                <span className="inline-block w-6 h-6 group-open:rotate-90 transition">▶</span>
                How much time does it require?
              </summary>
              <p className="text-gray-600 mt-4 ml-8">
                GSOC is a full-time commitment during the program period (typically 12+ weeks in the summer). You should be prepared to dedicate 30-40 hours per week.
              </p>
            </details>

            <details className="bg-gray-50 rounded-lg p-6 cursor-pointer group">
              <summary className="font-bold text-gray-900 flex items-center gap-2">
                <span className="inline-block w-6 h-6 group-open:rotate-90 transition">▶</span>
                Do I need to be experienced in open source?
              </summary>
              <p className="text-gray-600 mt-4 ml-8">
                No prior open-source experience is required, but enthusiasm and willingness to learn are essential. Many participants are contributing to open source for the first time.
              </p>
            </details>

            <details className="bg-gray-50 rounded-lg p-6 cursor-pointer group">
              <summary className="font-bold text-gray-900 flex items-center gap-2">
                <span className="inline-block w-6 h-6 group-open:rotate-90 transition">▶</span>
                What are the application deadlines?
              </summary>
              <p className="text-gray-600 mt-4 ml-8">
                Applications typically open in May and close in June. Visit our home page for the detailed 2026 timeline. Organizations apply earlier to have their projects approved.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-blue-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to Join the Community?
          </h2>
          <p className="text-gray-600 mb-8">
            Start your open-source journey today. Explore projects, meet mentors, and make an impact.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
              Browse Projects
            </button>
            <button className="px-8 py-3 border-2 border-blue-600 text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition">
              Learn More
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
           