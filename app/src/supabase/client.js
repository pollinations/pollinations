import {createClient} from "@supabase/supabase-js"

const supabaseUrl = "https://vtxnaziguspwqgndeais.supabase.co"
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0eG5hemlndXNwd3FnbmRlYWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDc1MjI5NjQsImV4cCI6MTk2MzA5ODk2NH0.sMlEkFJUdP8imkKF-a13C-MDvpyn0nbk2WDZBcMHg1A"
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default supabase