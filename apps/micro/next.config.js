/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    BREVO_KEY: process.env.BREVO_KEY,
    BREVO_MAIL: process.env.BREVO_MAIL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  },
}

export default nextConfig

