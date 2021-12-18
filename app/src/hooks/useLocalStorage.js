import { useState } from "react";

// Hook
export default function useLocalStorage(key, initialValue) {
  
  const [storedValue, setStoredValue] = useState(
    () => window.localStorage.getItem(key) ? JSON.parse(window.localStorage.getItem(key)) : initialValue
  )

  const setValue = value => {
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
  }
  

  return [storedValue, setValue ];
}
