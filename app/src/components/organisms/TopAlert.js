import Alert from "@material-ui/lab/Alert"
import { useState, useEffect } from "react"


const TopAlert = ({ options }) => {
  
    const [isOff, setOff] = useState(false)
  
    let offline = 'Hey, pollinations.ai is having temporary issues, please retry in few hours.'
  
    useEffect(() => {
      setTimeout(() => setOff(true), 10000)
    },[])
  
    if (options?.length) 
      return <></>;
    
    return <Alert severity={ isOff ? 'error' : ''}>
      { isOff ? offline : 'Loading...' }
    </Alert>
  }

  export default TopAlert