import * as React from 'react'
import { getCurrentUser, handleSocialLogin, signOut } from '../supabase/user'

const AuthContext = React.createContext()

const loginProviders = [
    "discord",
    "google",
    "github",
    "twitter",
    "facebook",
]


function AuthProvider({ children }) {

    const [ user, setUser ] = React.useState(null)

    

    React.useEffect(() => {
        async function getUser(){
            const user = await getCurrentUser()
            if (user) return setUser(user)
            return setUser(null)
        }
        setTimeout(() => {
            getUser()
        }, 100);
    },[])

    async function handleSignOut() {
        await signOut()
        setUser(null)
    }
    

  return <AuthContext.Provider value={ {
      user,
      loginProviders,
      getCurrentUser,
      handleSignOut,
      handleSignIn: handleSocialLogin,
      }}>
      {children}
    </AuthContext.Provider>
}

function useAuth() {
  const context = React.useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within a CountProvider')
  }
  return context
}

export {AuthProvider, useAuth}