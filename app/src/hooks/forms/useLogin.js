import React from "react"
import { useNavigate } from "react-router-dom"
import { signInWithEmail } from "../../supabase/user"

export default function useLogin(){
    const [ err, setErr ] = React.useState('')
    const usernameRef = React.useRef()
    const passwordRef = React.useRef()
    const navigate = useNavigate()
  
    async function onSubmit(e){
        e.preventDefault()
        // Clear error field
        setErr({})
  
        // handleSignIn
        let { data, error } = await signInWithEmail({
            username: usernameRef.current.value,
            password: passwordRef.current.value
        });
        // Success
        if (data.user !== null) navigate('/d');
        // Fail
        if (error?.message) setErr(error);
    }
  
    return ({
      onSubmit,
      fields: [ 
        { inputRef: usernameRef, label: 'Email', type: 'email' },
        { inputRef: passwordRef, label: 'Password', type: 'password' }
      ],
      err
    })
}