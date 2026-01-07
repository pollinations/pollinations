import { Link } from 'react-router-dom'

export default function Home() {
  const stats = [
    { label: 'Years Active', value: '20+' },
    { label: 'Contributors', value: '19,000+' },
    { label: 'Organizations', value: '900+' },
    { label: 'Countries', value: '110+' }
  ]

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="pt-20 pb-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Google Summer of Code 2026
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Your journey into open source starts here. Work on real-world projects, learn from industry leaders, and make an impact on the global developer community.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/ideas"
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
            >
              Explore Project Ideas
            </Link>
            <Link
              to="/mentors"
              className="px-8 py-3 border-2 border-blue-600 text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition"
            >
              Meet Our Mentors
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-blue-600 mb-2">
                  {stat.value}
                </div>
                <div className="text-gray-600 text-sm md:text-base">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why GSOC Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-12 text-center">
            Why Google Summer of Code?
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-8 border border-gray-200 rounded-lg hover:shadow-lg transition">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Real-World Impact</h3>
              <p className="text-gray-600">
                Contribute to projects used by millions. Your code will make a real difference in the open-source ecosystem.
              </p>
            </div>
            <div className="p-8 border border-gray-200 rounded-lg hover:shadow-lg transition">
              <div className="text-4xl mb-4">👨‍🏫</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Expert Mentorship</h3>
              <p className="text-gray-600">
                Learn directly from experienced developers and technology leaders who are passionate about guiding the next generation.
              </p>
            </div>
            <div className="p-8 border border-gray-200 rounded-lg hover:shadow-lg transition">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Competitive Compensation</h3>
              <p className="text-gray-600">
                Earn competitive stipends during your summer. The amount depends on your location, with payments made monthly.
              </p>
            </div>
            <div className="p-8 border border-gray-200 rounded-lg hover:shadow-lg transition">
              <div className="text-4xl mb-4">🌍</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Global Community</h3>
              <p className="text-gray-600">
                Connect with talented developers from over 110 countries. Build lifelong friendships and professional networks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="bg-gray-50 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-gray-900 mb-12 text-center">
            2026 Timeline
          </h2>
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 bg-blue-600 rounded-full mt-2"></div>
                <div className="w-1 h-24 bg-blue-200"></div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">January 27, 2026</h3>
                <p className="text-gray-600">Mentoring organizations can begin submitting applications</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 bg-blue-600 rounded-full mt-2"></div>
                <div className="w-1 h-24 bg-blue-200"></div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">March 27, 2026</h3>
                <p className="text-gray-600">Org application deadline</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 bg-blue-600 rounded-full mt-2"></div>
                <div className="w-1 h-24 bg-blue-200"></div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">May 26 - June 23, 2026</h3>
                <p className="text-gray-600">Student application and coding period</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 bg-blue-600 rounded-full mt-2"></div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">August 31, 2026</h3>
                <p className="text-gray-600">Final deadline for student project completion</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg p-12 text-white text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Start Your Open Source Journey?
          </h2>
          <p className="text-lg mb-8 opacity-90">
            Explore our project ideas and find the perfect mentoring opportunity for you.
          </p>
          <Link
            to="/ideas"
            className="inline-block px-8 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100 transition"
          >
            Browse Projects Now
          </Link>
        </div>
    </div>
  )
}
