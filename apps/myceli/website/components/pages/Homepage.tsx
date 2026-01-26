const Homepage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100/50 via-orange-50/30 to-rose-50/40">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex flex-col justify-center py-24 md:py-32 lg:py-40">
        {/* Subtle decorative background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-amber-200/30 rounded-full blur-3xl"></div>
          <div className="absolute bottom-40 right-10 w-96 h-96 bg-orange-200/20 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-rose-100/20 rounded-full blur-3xl"></div>
        </div>
        
        <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-4xl text-center relative z-10">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            myceli<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-orange-500 to-red-500">AI</span>
          </h1>
          <p className="text-xl md:text-2xl lg:text-3xl text-gray-700 font-medium mb-8 leading-relaxed">
            Building the creative AI infrastructure of tomorrow.
          </p>
          <p className="text-lg md:text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed">
            We are the company behind <strong className="text-gray-800">pollinations.ai</strong>, a unified AI platform and ecosystem powered by Pollen — a simple, universal credit that developers and end-users use across apps.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:hi@myceli.ai"
              className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
            >
              <span className="mr-2">→</span> Request Investor Access
            </a>
            <a
              href="https://pollinations.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-gray-700 bg-white/80 backdrop-blur-sm border-2 border-gray-200 rounded-full shadow-md hover:shadow-lg hover:border-gray-300 hover:scale-105 transition-all duration-300"
            >
              <span className="mr-2">→</span> Explore pollinations.ai
            </a>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce">
          <span className="text-sm text-gray-500 mb-2">Scroll to explore</span>
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* What Is Myceli Section */}
      <section className="py-20 md:py-28 bg-white/60">
        <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center">
            What Is Myceli
          </h2>
          <div className="space-y-6 text-lg text-gray-600 leading-relaxed">
            <p>
              <strong className="text-gray-800">Myceli</strong> is the holding company and product studio behind the <em>pollinations.ai</em> ecosystem.
            </p>
            <p>
              <em>pollinations.ai</em> began as an open-source creative AI project. Over time, the community and code outgrew the original structure. Myceli was created to give <em>pollinations.ai</em> a proper foundation, a clear business model, and the resources to scale.
            </p>
            <p>
              We build developer-centric AI infrastructure with a soft, expressive identity — tools designed for creativity, experimentation, and scalable app ecosystems.
            </p>
            <p>
              Our mission is to grow an open, community-driven environment where developers create the next generation of AI-native apps, and where Pollen becomes the shared economic layer underneath them.
            </p>
          </div>
        </div>
      </section>

      {/* pollinations.ai Overview Section */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center">
            <em>pollinations.ai</em> Overview
          </h2>
          <div className="space-y-6 text-lg text-gray-600 leading-relaxed">
            <p>
              <em className="text-gray-800 not-italic font-semibold">pollinations.ai</em> is our flagship product — an AI platform for creative developers.
            </p>
            <p className="font-medium text-gray-700"><em>pollinations.ai</em> provides:</p>
            <ul className="space-y-3 ml-1">
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-orange-400 rounded-full mt-2.5 mr-4 flex-shrink-0"></span>
                <span>A unified multimodal API (image, text, audio; real-time and video soon)</span>
              </li>
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-orange-400 rounded-full mt-2.5 mr-4 flex-shrink-0"></span>
                <span><strong className="text-gray-800">Pollen</strong>, a single credit for all generative media</span>
              </li>
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-orange-400 rounded-full mt-2.5 mr-4 flex-shrink-0"></span>
                <span>Developer tiers, grants, and rewards</span>
              </li>
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-orange-400 rounded-full mt-2.5 mr-4 flex-shrink-0"></span>
                <span><em>pollinations.ai</em> Login (OAuth) for instant app onboarding</span>
              </li>
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-orange-400 rounded-full mt-2.5 mr-4 flex-shrink-0"></span>
                <span>A growing community building games, tools, worlds, and workflows</span>
              </li>
            </ul>
            <p>
              <em>pollinations.ai</em> is both a playground and a platform: developers explore, build, launch apps — and those apps plug into a shared economy.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
            <a
              href="https://pollinations.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-white bg-gradient-to-r from-orange-500 to-red-500 rounded-full shadow-md hover:shadow-lg hover:scale-105 transition-all duration-300"
            >
              <span className="mr-2">→</span> Visit pollinations.ai
            </a>
            <a
              href="https://enter.pollinations.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-gray-700 bg-white border-2 border-gray-200 rounded-full shadow-sm hover:shadow-md hover:border-gray-300 hover:scale-105 transition-all duration-300"
            >
              <span className="mr-2">→</span> Get Your API Key
            </a>
          </div>
        </div>
      </section>

      {/* Business Model Section */}
      <section className="py-20 md:py-28 bg-gradient-to-b from-amber-50/40 to-white">
        <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center">
            Business Model Summary
          </h2>
          <p className="text-lg text-gray-600 mb-10 text-center">
            The foundation of Myceli&apos;s business is the <strong className="text-gray-800">Pollen economy</strong>.
          </p>
          
          <h3 className="text-xl font-semibold text-gray-800 mb-6">How the business works:</h3>
          <ol className="space-y-4 text-lg text-gray-600 mb-10">
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-7 h-7 bg-orange-100 text-orange-600 font-semibold rounded-full mr-4 flex-shrink-0 text-sm">1</span>
              <span><strong className="text-gray-800">Developers build apps</strong> using <em>pollinations.ai</em>.</span>
            </li>
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-7 h-7 bg-orange-100 text-orange-600 font-semibold rounded-full mr-4 flex-shrink-0 text-sm">2</span>
              <span><strong className="text-gray-800">Users log in</strong> with <em>pollinations.ai</em> Login (OAuth).</span>
            </li>
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-7 h-7 bg-orange-100 text-orange-600 font-semibold rounded-full mr-4 flex-shrink-0 text-sm">3</span>
              <span><strong className="text-gray-800">Users buy Pollen inside those apps</strong> with one click.</span>
            </li>
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-7 h-7 bg-orange-100 text-orange-600 font-semibold rounded-full mr-4 flex-shrink-0 text-sm">4</span>
              <span>Developers and Myceli both benefit.</span>
            </li>
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-7 h-7 bg-orange-100 text-orange-600 font-semibold rounded-full mr-4 flex-shrink-0 text-sm">5</span>
              <span>The economy strengthens as more apps appear.</span>
            </li>
          </ol>
          
          <div className="bg-white/80 rounded-2xl p-8 shadow-sm border border-orange-100">
            <p className="text-lg text-gray-700 font-medium mb-4">This model creates:</p>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-amber-400 rounded-full mt-2.5 mr-4 flex-shrink-0"></span>
                <span>A growing network of AI apps</span>
              </li>
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-amber-400 rounded-full mt-2.5 mr-4 flex-shrink-0"></span>
                <span>A single credit shared across all experiences</span>
              </li>
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-amber-400 rounded-full mt-2.5 mr-4 flex-shrink-0"></span>
                <span>Organic revenue driven by end users</span>
              </li>
              <li className="flex items-start">
                <span className="inline-block w-2 h-2 bg-amber-400 rounded-full mt-2.5 mr-4 flex-shrink-0"></span>
                <span>Aligned incentives for developers and Myceli</span>
              </li>
            </ul>
            <p className="text-gray-600 mt-6">
              API usage and direct developer purchases exist, but the <strong className="text-gray-800">core engine</strong> is consumer Pollen purchases inside developer-created apps.
            </p>
          </div>
        </div>
      </section>

      {/* Ecosystem Flywheel Section */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center">
            The Ecosystem Flywheel
          </h2>
          <p className="text-lg md:text-xl text-gray-700 font-medium text-center mb-12 leading-relaxed">
            Builders attract users → users buy Pollen → developers earn → more builders join → more apps → more users → more Pollen circulation.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { num: 1, text: 'Developers join' },
              { num: 2, text: 'They build apps with pollinations.ai' },
              { num: 3, text: 'Users log in with pollinations.ai' },
              { num: 4, text: 'Users buy Pollen inside apps' },
              { num: 5, text: 'Developers earn rewards' },
              { num: 6, text: 'More apps, more users, more spending' },
              { num: 7, text: 'The economy grows' },
            ].map(({ num, text }) => (
              <div
                key={num}
                className={`flex items-center p-5 bg-white/80 rounded-xl border border-orange-100 shadow-sm ${num === 7 ? 'md:col-span-2 md:justify-center' : ''}`}
              >
                <span className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 text-white font-bold rounded-full mr-4 flex-shrink-0">
                  {num}
                </span>
                <span className="text-lg text-gray-700">{text}</span>
              </div>
            ))}
          </div>
          
          <p className="text-lg text-gray-600 text-center mt-10">
            This is how Pollen becomes a widely recognized way to buy generative AI.
          </p>
        </div>
      </section>

      {/* Roadmap Section */}
      <section className="py-20 md:py-28 bg-gradient-to-b from-white to-amber-50/30">
        <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center">
            Short Roadmap
          </h2>
          <p className="text-lg text-gray-600 mb-10 text-center">
            The next chapters of the <em>pollinations.ai</em> ecosystem, managed by Myceli:
          </p>
          
          <div className="space-y-4">
            {[
              { id: 'in-app-purchases', title: 'In-app Pollen purchases', desc: '(primary economic unlock)' },
              { id: 'app-hosting', title: 'App hosting & discovery', desc: '(launch and showcase apps easily)' },
              { id: 'quests', title: 'Quests, bounties & community programs', desc: '' },
              { id: 'sdk-templates', title: 'SDK upgrades & templates', desc: 'for fast app creation' },
            ].map(({ id, title, desc }) => (
              <div
                key={id}
                className="flex items-start p-5 bg-white/80 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <span className="inline-block w-3 h-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full mt-1.5 mr-4 flex-shrink-0"></span>
                <span className="text-lg text-gray-700">
                  <strong className="text-gray-800">{title}</strong>
                  {desc && <span className="text-gray-500"> {desc}</span>}
                </span>
              </div>
            ))}
          </div>
          
          <p className="text-lg text-gray-600 text-center mt-10">
            These steps transform <em>pollinations.ai</em> into a full AI app development ecosystem.
          </p>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-10 text-center">
            Team
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <div className="p-6 bg-white/60 rounded-xl border border-gray-100">
              <p className="text-lg font-semibold text-gray-900">Thomas Haferlach</p>
              <p className="text-sm text-orange-600 font-medium mb-2">CEO</p>
              <p className="text-sm text-gray-600 mb-3">Founder of pollinations.ai, with years of experience in generative AI and creative tooling.</p>
              <a href="mailto:thomas@myceli.ai" className="text-sm text-orange-600 hover:text-orange-700 transition-colors">
                thomas@myceli.ai
              </a>
            </div>
            <div className="p-6 bg-white/60 rounded-xl border border-gray-100">
              <p className="text-lg font-semibold text-gray-900">Elliot Fouchy</p>
              <p className="text-sm text-orange-600 font-medium mb-2">COO</p>
              <p className="text-sm text-gray-600 mb-3">6+ years in AI infrastructure development. Leads operations, partnerships, and business strategy.</p>
              <a href="mailto:elliot@myceli.ai" className="text-sm text-orange-600 hover:text-orange-700 transition-colors">
                elliot@myceli.ai
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Investor Access Section */}
      <section className="py-24 md:py-32">
        <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-3xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
            Investor Access
          </h2>
          <p className="text-lg text-gray-600 mb-10">
            Access the data room, financials, roadmap details, and operational documents.
          </p>
          
          <a
            href="mailto:hi@myceli.ai"
            className="inline-flex items-center justify-center px-10 py-5 text-xl font-semibold text-white bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300"
          >
            <span className="mr-2">→</span> Request Investor Access
          </a>
        </div>
      </section>
    </div>
  );
};

export default Homepage;
