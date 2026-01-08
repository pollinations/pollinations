import { Link } from 'react-router-dom'
import { useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import '../styles/navigation.css'

export default function Navigation() {
  const [yearDropdown, setYearDropdown] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const years = ['2026', '2025', '2024', '2023']
  const currentYear = '2026'

  const navItems = [
    { name: 'Ideas', path: '/ideas' },
    { name: 'Mentors', path: '/mentors' },
    { name: 'About', path: '/about' }
  ]

  return (
    <div className="h-[65px]  w-full rounded-[20px] bg-transparent mx-auto flex items-center justify-center mt-8 absolute top-10">
      <div className="navigation w-[70%] h-full bg-white-200 mx-auto rounded-[10px] shadow-xl flex flex-col">
            <div className=" flex items-center justify-between h-full px-6 overflow-hidden">

              <Link to="/" className="navLogo w-1/2 flex items-center gap-2 pl-5 box-border">
                <img src="/polli_black.svg" alt="Vite" className="w-8 h-8" />
                <span className="font-bold text-xl text-gray-800">pollinations.ai</span>
              </Link>
              
              <div className="flex items-center gap-8 flex-1 justify-center">
                {navItems.map(item => (
                  <Link key={item.path} to={item.path} className="text-gray-700 hover:text-black transition">
                    {item.name}
                  </Link>
                ))}
              </div>


              </div>
            </div>
        </div>  
  )
}
