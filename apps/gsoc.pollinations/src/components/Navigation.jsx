import { Link } from 'react-router-dom'
import { useState } from 'react'
import '../styles/navigation.css'

export default function Navigation() {
  const navItems = [
    { name: 'Ideas', path: '/ideas' },
    { name: 'Mentors', path: '/mentors' },
    { name: 'About', path: '/about' }
  ]

  return (
    <div className="h-16.25 w-full rounded-[20px] bg-transparent mx-auto flex items-center justify-center mt-8 absolute top-10">
      <div className="navigation w-[70%] h-full bg-white-200 mx-auto rounded-[10px] shadow-xl flex flex-col">
        <div className="flex items-center justify-between h-full overflow-hidden">
          <Link to="/" className="navLogo w-1/2 flex items-center gap-2 pl-5 box-border">
            <img src="/polli_black.svg" alt="Vite" className="w-8 h-8" />
            <span className="font-bold text-xl text-gray-800">pollinations.ai</span>
          </Link>
          
          <div className="flex items-center gap-10 flex-1 justify-center flex-row">
            {navItems.map(item => (
              <Link key={item.path} to={item.path} className="text-gray-700 font-bold text-[#888] hover:text-black transition-colors duration-200 relative group">
                {item.name}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-black group-hover:w-full transition-all duration-200"></span>
              </Link>
            ))}

            <div className="socials flex flex-row gap-[15px] box-border">
              <img src="/discord.svg" alt="discord-logo" className="social_icon w-8 h-8 min-w-8 min-h-8 max-w-8 max-h-8 cursor-pointer rounded-[5px] box-border shadow-lg transition-shadow duration-200 hover:shadow-xl hover:scale-105" />
              <img src="/github.svg" alt="github-logo" className="social_icon w-8 h-8 min-w-8 min-h-8 max-w-8 max-h-8 cursor-pointer rounded-[5px] box-border shadow-lg transition-shadow duration-200 hover:shadow-xl hover:scale-105" />
            </div>
          </div>


        </div>
      </div>
    </div>
  )
}
