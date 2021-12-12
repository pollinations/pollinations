import { useEffect, useRef } from "react"

const useClickOutside = (ref, callback) => {
    // reference callback otherwise it rerenders all the time as dependency in useEffect
    // avoids using useCallback in the parent function
    const callbackRef = useRef()
    callbackRef.current = callback

    useEffect(()=> {
        // avoids passing the function as dependency
        const handleClickOutside = e => {
            if (ref?.current?.contains(e.target) && callbackRef.current) return 
            return callbackRef.current(e)
        }

        document.addEventListener('click', handleClickOutside, true)

        // cleanup
        return () => {
            document.removeEventListener('click', handleClickOutside, true)
        }
    },[ callbackRef, ref ])
}

export default useClickOutside