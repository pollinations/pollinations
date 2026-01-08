import { Link } from 'react-router-dom'
import { useState } from 'react'

export default function Navigation() {
  const [isOpen, setIsOpen] = useState(false)

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'Projects', path: '/projects' },
    { name: 'Ideas', path: '/ideas' },
    { name: 'Mentors', path: '/mentors' },
    { name: 'About', path: '/about' }
  ]

  return (
    <nav className='fixed top-0 w-full flex justify-center  z-50 bg-linear-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/50 shadow-lg'>

      <div className='w-[90%] max-auto'>
        <div className='flex flex-row justify-between items-center h-16  px-13 box-border'>

          <Link to='/' className='flex items-center gap-5 group hover:opacity-80 transition-opacity ml-8'>
            <div className='relative'>
              <img 
                src='/vite.svg' 
                alt='Vite Logo' 
                className='h-10 w-10 drop-shadow-lg group-hover:scale-110 transition-transform'
              />
              <div className='absolute inset-0 bg-linear-to-r from-blue-500 to-purple-500 opacity-0 group-hover:opacity-20 rounded-lg blur transition-opacity'></div>
            </div>
            <div className='flex flex-col'>
              <span className='text-xl font-bold bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent'>
                Pollinations
              </span>
              <span className='text-xs text-slate-400'>GSOC 2026</span>
            </div>
          </Link>

          <div className='flex items-center gap-8'>
            <div className='hidden md:flex gap-6'>
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  to={item.path}
                  className='relative text-slate-100! hover:text-white! transition-colors text-sm font-medium group'
                >
                  {item.name}
                  <div className='absolute bottom-0 left-0 w-0 h-0.5 bg-linear-to-r from-blue-400 to-purple-400 group-hover:w-full transition-all duration-300'></div>
                </Link>
              ))}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className='md:hidden p-2 rounded-lg hover:bg-slate-700 transition-colors'
            >
              <svg className='w-6 h-6 text-slate-200!' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 6h16M4 12h16M4 18h16' />
              </svg>
            </button>
          </div>
        </div>

        {isOpen && (
          <div className='md:hidden mt-4 pb-4 border-t border-slate-700/50 pt-4 flex flex-col gap-3'>
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className='text-slate-100! hover:text-white! px-4 py-2 rounded-lg hover:bg-slate-700/50 transition-colors text-sm'
                onClick={() => setIsOpen(false)}
              >
                {item.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}
