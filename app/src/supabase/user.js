import supabase from "./client"

export const getCurrentUser = async () =>{    
    const res = await supabase.auth.getSession()
    console.log(res)
    return res
}
export async function getUser(){
     return await supabase.auth.getUser()
}

export const signOut = () => supabase.auth.signOut((err) => {
    console.error(err)
})

// Ex: handleSocialLogin("facebook", "https://pollinations.ai")
export async function handleSocialLogin(provider, redirectTo = "localhost:3000/") {
    return await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
            redirectTo: "localhost:3000/"
        }
    }, 
    {
        redirectTo: window.location.origin + redirectTo
    })
}

export async function signInWithEmail(user) {

    if(!user.username) return ({
        error: 'missing username'
    })
    if(!user.password) return ({
        error: 'missing password'
    })

    return await supabase.auth.signInWithPassword({
      email: user?.username,
      password: user?.password,
    },
    {options: {
        redirectTo: "localhost:3000/"
    }})
}
export async function signUpwithEmail(user) {

    if(!user.username) return ({
        error: 'missing username'
    })
    if(!user.password) return ({
        error: 'missing password'
    })

    return await supabase.auth.signUp({
      email: user?.username,
      password: user?.password,
    })
}
