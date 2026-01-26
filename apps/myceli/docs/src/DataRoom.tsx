import { useState, useEffect } from 'react';
import { marked } from 'marked';

interface Section {
  id: string;
  title: string;
  file: string;
}

const sections: Section[] = [
  { id: 'blurb', title: 'Blurb', file: 'blurb.md' },
  { id: 'executive-summary', title: 'Executive Summary', file: 'executive-summary.md' },
  { id: 'vision-mission', title: 'Vision & Mission', file: 'vision-mission.md' },
  { id: 'business-model', title: 'Business Model', file: 'business-model.md' },
  { id: 'market-opportunity', title: 'Market Opportunity', file: 'market-opportunity.md' },
  { id: 'roadmap', title: 'Roadmap', file: 'roadmap.md' },
  { id: 'team', title: 'Team', file: 'team.md' },
];

const DataRoom = () => {
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const currentIndex = sections.findIndex(s => s.id === activeSection);
  const currentSection = sections[currentIndex];
  const prevSection = currentIndex > 0 ? sections[currentIndex - 1] : null;
  const nextSection = currentIndex < sections.length - 1 ? sections[currentIndex + 1] : null;

  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/docs-content/${currentSection.file}`);
        if (response.ok) {
          const markdown = await response.text();
          const html = await marked(markdown);
          setContent(html);
        } else {
          setContent('<p class="text-gray-500">Content not found.</p>');
        }
      } catch {
        setContent('<p class="text-red-500">Failed to load content.</p>');
      }
      setLoading(false);
    };

    loadContent();
  }, [currentSection]);

  const navigateTo = (sectionId: string) => {
    setActiveSection(sectionId);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center gap-2 text-gray-700 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span>{currentSection.title}</span>
          </button>
          <span className="text-sm text-gray-400">{currentIndex + 1} / {sections.length}</span>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <>
          <div 
            className="lg:hidden fixed inset-0 z-50 bg-black/50" 
            onClick={() => setSidebarOpen(false)}
            onKeyDown={e => e.key === 'Escape' && setSidebarOpen(false)}
            role="button"
            tabIndex={0}
            aria-label="Close sidebar"
          />
          <div className="lg:hidden fixed left-0 top-0 bottom-0 w-72 bg-white shadow-xl overflow-y-auto z-50">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900">Data Room</h2>
                <button type="button" onClick={() => setSidebarOpen(false)} className="text-gray-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <nav className="p-2">
              {sections.map((section, idx) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => navigateTo(section.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-orange-50 text-orange-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-gray-400 mr-3">{idx + 1}.</span>
                  {section.title}
                </button>
              ))}
            </nav>
          </div>
        </>
      )}

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-72 flex-shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-gray-100 bg-white/80 backdrop-blur-sm">
          <div className="p-6">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">
                myceli<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">AI</span>
              </h1>
              <p className="text-sm text-gray-500 mt-1">Data Room</p>
            </div>
            <nav className="space-y-1">
              {sections.map((section, idx) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => navigateTo(section.id)}
                  className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all ${
                    activeSection === section.id
                      ? 'bg-gradient-to-r from-orange-50 to-amber-50 text-orange-700 font-medium border-l-2 border-orange-500'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="text-gray-400 mr-2 text-xs">{idx + 1}.</span>
                  {section.title}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-6 py-12 lg:py-16">
            {/* Progress indicator */}
            <div className="mb-8">
              <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                <span>{currentSection.title}</span>
                <span>{currentIndex + 1} of {sections.length}</span>
              </div>
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / sections.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Content */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <article 
                className="prose prose-gray prose-lg max-w-none prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-orange-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-800 prose-code:text-orange-600 prose-code:bg-orange-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            )}

            {/* Navigation */}
            <div className="mt-16 pt-8 border-t border-gray-100">
              <div className="flex items-center justify-between gap-4">
                {prevSection ? (
                  <button
                    type="button"
                    onClick={() => navigateTo(prevSection.id)}
                    className="group flex items-center gap-3 px-5 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors text-left flex-1 max-w-xs"
                  >
                    <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <div>
                      <p className="text-xs text-gray-400">Previous</p>
                      <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{prevSection.title}</p>
                    </div>
                  </button>
                ) : (
                  <div />
                )}

                {nextSection ? (
                  <button
                    type="button"
                    onClick={() => navigateTo(nextSection.id)}
                    className="group flex items-center gap-3 px-5 py-3 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 transition-colors text-right flex-1 max-w-xs justify-end"
                  >
                    <div>
                      <p className="text-xs text-orange-400">Next</p>
                      <p className="text-sm font-medium text-orange-700">{nextSection.title}</p>
                    </div>
                    <svg className="w-5 h-5 text-orange-400 group-hover:text-orange-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ) : (
                  <div />
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default DataRoom;
