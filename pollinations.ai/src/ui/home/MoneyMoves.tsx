const STEPS = [
    "A user signs in to your app with Pollinations, holding Pollen they bought or earned from Quests",
    "Every generation is paid from their balance — spending caps and revoke stay in their hands",
    "You receive an app reward on that spend — and a model reward too, if it's your model",
];

/**
 * Deliberately the proof, not the reveal: the hero already claims the wallet,
 * so this section shows the mechanics rather than announcing them. The
 * numbering is earned — these are sequential steps, not decoration.
 */
export function MoneyMoves() {
    return (
        <section className="mx-6 mb-6 grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-center gap-12 rounded-3xl bg-brand-dark px-8 py-14 md:px-14">
            <div className="flex flex-col gap-5">
                <p className="font-pixel text-sm tracking-widest text-theme-bg-active uppercase">
                    How the money moves
                </p>
                <h2 className="font-heading text-4xl leading-tight text-white">
                    Your app doesn&rsquo;t need a budget to launch.
                </h2>
                <p className="max-w-lg leading-relaxed text-white/80">
                    On most platforms every user you win costs you money. Here,
                    users hold their own Pollen — bought, or earned free by
                    completing Quests — so usage scales without a bill landing
                    on you, and a share of what they spend comes back to you.
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-5">
                    <a
                        href="https://enter.pollinations.ai"
                        className="rounded-xl bg-theme-bg-active px-7 py-3 font-semibold text-theme-text-strong"
                    >
                        Start earning
                    </a>
                    <a
                        href="https://docs.pollinations.ai"
                        className="text-sm font-semibold text-white"
                    >
                        See how the split works →
                    </a>
                </div>
            </div>

            <ol className="flex flex-col gap-3">
                {STEPS.map((step, index) => (
                    <li
                        key={step}
                        className="flex items-start gap-4 rounded-2xl bg-white/6 px-5 py-4"
                    >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-theme-bg-active font-pixel text-sm text-theme-text-strong">
                            {index + 1}
                        </span>
                        <p className="text-sm leading-relaxed text-white/85">
                            {step}
                        </p>
                    </li>
                ))}
            </ol>
        </section>
    );
}
