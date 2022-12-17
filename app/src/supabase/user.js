import supabase from "./client"

export const getCurrentUser = async () =>{    
    const res = await supabase.auth.getSession()
    console.log(res)
    return res
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
