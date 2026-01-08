import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    document.title = "GSOC Pollinations"
  }, [])

  return (
    <section className="flex flex-col items-center justify-center px-6 pt-28 pb-32 text-center">
      
      {/* Figma Sync Badge */}
      <div className="mb-10 flex items-center gap-3 rounded-full border border-neutral-200 bg-neutral-50 px-5 py-2 text-sm text-neutral-600 shadow-sm">
        <span className="flex h-4 w-4 items-center justify-center rounded bg-linear-to-tr from-pink-500 to-orange-400" />
        <span>Up-to-date Figma file synced with code library!</span>
        <span className="ml-1 text-neutral-400">Preview →</span>
      </div>

      {/* Trusted Badge */}
      <div className="mb-12 flex items-center gap-3 rounded-full border border-neutral-200 bg-white px-4 py-1.5 shadow-sm">
        <div className="flex -space-x-2">
          <img className="h-6 w-6 rounded-full border" src="/avatar1.jpg" />
          <img className="h-6 w-6 rounded-full border" src="/avatar2.jpg" />
          <img className="h-6 w-6 rounded-full border" src="/avatar3.jpg" />
          <img className="h-6 w-6 rounded-full border" src="/avatar4.jpg" />
        </div>
        <span className="text-sm text-neutral-600">
          Trusted by <strong>2,000+</strong> Figma users for seamless design!
        </span>
      </div>

      {/* Headline */}
      <h1 className="max-w-5xl text-5xl font-extrabold leading-tight tracking-tight text-neutral-900 md:text-7xl">
        <span className="relative inline-block bg-neutral-100 px-4 py-1">
          Design & Development
        </span>
        <br />
        perfectly aligned
      </h1>

      {/* Subheading */}
      <p className="mt-6 max-w-2xl text-lg text-neutral-600">
        Flexible components, consistent UI, quick development, easy integration.
      </p>

      {/* Tech Row */}
      <div className="mt-10 flex items-center gap-6 text-neutral-500">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚛️</span>
          <span>Built for React</span>
        </div>
        <span className="text-neutral-300">•</span>
        <div className="flex items-center gap-2">
          <span className="text-lg">🎨</span>
          <span>Styled with TailwindCSS</span>
        </div>
      </div>

      {/* CTA */}
      <button className="mt-14 rounded-2xl bg-neutral-900 px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:scale-[1.03] hover:shadow-xl">
        Get Started <span className="ml-2 text-neutral-400">– It's free</span>
      </button>

    </section>
  )
}