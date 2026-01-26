import { useState } from 'react';

const LandingHeader = () => {
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText('hi@myceli.ai');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = 'hi@myceli.ai';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm">
      {/* Animated gradient border */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 animate-login-gradient bg-[size:300%_300%]"></div>
      
      <div className="container mx-auto px-6 md:px-8 lg:px-12 py-5">
        <div className="flex justify-between items-center">
          {/* Logo and Company Name */}
          <div className="flex items-center space-x-3">
            <img 
              src="/myceli-ai-logo.png" 
              alt="myceli.ai Logo" 
              className="h-8 w-auto" 
            />
            <span className="font-black text-xl text-gray-900">myceli<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-orange-500 to-red-500">AI</span></span>
          </div>
          
          {/* Contact Button */}
          <button
            type="button"
            onClick={handleCopyEmail}
            className={`group relative px-5 py-2.5 text-sm font-semibold rounded-full transition-all duration-300 flex items-center space-x-2 ${
              copied 
                ? 'text-white bg-gradient-to-r from-green-500 to-emerald-500 shadow-lg' 
                : 'text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>hi@myceli.ai</span>
              </>
            )}
            
            {/* Tooltip */}
            {!copied && (
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
                Click to copy hi@myceli.ai
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
              </div>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

export default LandingHeader;
