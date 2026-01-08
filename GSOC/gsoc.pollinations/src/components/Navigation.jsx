import { Link } from 'react-router-dom'
import { useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export default function Navigation() {
  const [yearDropdown, setYearDropdown] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const years = ['2026', '2025', '2024', '2023']
  const currentYear = '2026'

  const navItems = [
    { name: 'Projects', path: '/projects' },
    { name: 'Ideas', path: '/ideas' },
    { name: 'Mentors', path: '/mentors' },
    { name: 'About', path: '/about' }
  ]

  return (
    <nav className="fixed top-4 left-1/2 transform -translate-x-1/2 w-[95%] max-w-6xl z-50">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 px-6 py-3 flex items-center justify-between">
        
        {/* Logo */}
        <Link to="/" className="text-2xl font-bold text-orange-600 shrink-0">
          🐝
        </Link>

        {/* Year Dropdown */}
        <div className="relative ml-6">
          <button
            onClick={() => setYearDropdown(!yearDropdown)}
            className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors text-sm"
          >
            v{currentYear}
            <ChevronDown size={16} />
          </button>
          {yearDropdown && (
            <div className="absolute top-full mt-2 left-0 bg-white border border-gray-200 rounded-lg shadow-lg w-32">
              {years.map((year) => (
                <button
                  key={year}
                  onClick={() => setYearDropdown(false)}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm first:rounded-t-lg last:rounded-b-lg"
                >
                  v{year}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Nav Items */}
        <div className="hidden md:flex items-center gap-8 flex-1 ml-8">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="text-gray-700 hover:text-gray-900 text-sm font-medium transition-colors"
            >
              {item.name}
            </Link>
          ))}
        </div>

        {/* Search Bar */}
        <div className="flex-1 flex justify-end gap-4">
          <div className="relative hidden sm:block">
            {!searchOpen && (
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Search size={18} className="text-gray-700" />
              </button>
            )}
            {searchOpen && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center bg-gray-100 rounded-lg px-3 py-2 gap-2">
                <input
                  type="text"
                  placeholder="Quick search..."
                  className="bg-transparent outline-none text-sm w-32 text-gray-700 placeholder-gray-500"
                  autoFocus
                  onBlur={() => setSearchOpen(false)}
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X size={16} className="text-gray-500" />
                </button>
              </div>
            )}
          </div>

          {/* Right Icons */}
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <span className="text-gray-700">⌘K</span>
            </button>
            <a href="#" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <span className="text-xl">𝕏</span>
            </a>
            <a href="#" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <span className="text-xl">⚙️</span>
            </a>
          </div>
        </div>
      </div>
    </nav>
  )
}
