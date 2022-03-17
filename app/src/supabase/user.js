import supabase from "./client"

export const getCurrentUser = () => supabase.auth.user()

export const signOut = () => supabase.auth.signOut((err) => {
    console.error(err)
})

// Ex: handleSocialLogin("facebook", "https://pollinations.ai")
export async function handleSocialLogin(provider, redirectTo = "https://pollinations.ai") {
    const {user, error} = await supabase.auth.signIn({
        provider: provider
    }, {redirectTo: window.location.origin + redirectTo})
    if (error) console.error(error)
    return {user, error}
}
