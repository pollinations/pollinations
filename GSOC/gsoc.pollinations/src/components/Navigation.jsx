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
    { name: 'Projects', path: '/projects' },
    { name: 'Ideas', path: '/ideas' },
    { name: 'Mentors', path: '/mentors' },
    { name: 'About', path: '/about' }
  ]

  return (
    <div className="h-[65px]  w-full rounded-[20px] bg-transparent mx-auto flex items-center justify-center mt-8 absolute top-10">
      <div className="navigation w-[70%] h-full bg-white-200 mx-auto rounded-[10px] shadow-xl">
        
        </div>  
    </div>
  )
}
