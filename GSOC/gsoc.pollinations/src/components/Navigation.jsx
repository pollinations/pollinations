import { Link } from 'react-router-dom'
import { useState } from 'react'

export default function Navigation() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className='flex flex-col justify-between h-[80px] border-b-[#666] border-b-1 pr-5 pl-5 items-center'>
      <div className="flex flex-col gap-2">
        <div className=""></div>
        <div className="flex flex-row justify-between items-center h-[40px] w-[40px] max-w-7xl">pollinations.ai</div>
      </div>
    </div>
  )
}
