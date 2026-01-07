import { Link } from 'react-router-dom'
import { useState } from 'react'

export default function Navigation() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                GSOC 2026
              </span>
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-1">
            <Link
              to="/"
              className="text-gray-700 hover:text-blue-600 transition px-4 py-2 text-sm font-medium"
            >
              Home
            </Link>
            <Link
              to="/ideas"
              className="text-gray-700 hover:text-blue-600 transition px-4 py-2 text-sm font-medium"
            >
              Project Ideas
            </Link>
            <Link
              to="/mentors"
              className="text-gray-700 hover:text-blue-600 transition px-4 py-2 text-sm font-medium"
            >
              Mentors
            </Link>
            <Link
              to="/about"
              className="text-gray-700 hover:text-blue-600 transition px-4 py-2 text-sm font-medium"
            >
              About
            </Link>
          </div>

          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-700 hover:text-gray-900"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="md:hidden border-t border-gray-200 pb-4">
            <Link to="/" className="block text-gray-700 hover:text-blue-600 px-4 py-2 text-sm">
              Home
            </Link>
            <Link to="/ideas" className="block text-gray-700 hover:text-blue-600 px-4 py-2 text-sm">
              Project Ideas
            </Link>
            <Link to="/mentors" className="block text-gray-700 hover:text-blue-600 px-4 py-2 text-sm">
              Mentors
            </Link>
            <Link to="/about" className="block text-gray-700 hover:text-blue-600 px-4 py-2 text-sm">
              About
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}
