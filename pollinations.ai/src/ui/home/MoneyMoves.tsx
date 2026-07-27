import { Surface } from "@pollinations/ui";
import { ActionButton, ArrowLink, SectionHeader } from "../site/kit";

const STEPS = [
    "A user signs in to your app with Pollinations, holding Pollen they bought or earned from Quests",
    "Every generation is paid from their balance — spending caps and revoke stay in their hands",
    "You receive an app reward on that spend — and a model reward too, if it's your model",
];

/**
 * Deliberately the proof, not the reveal: the hero already claims the wallet,
 * so this shows the mechanics rather than announcing them. The numbering is
 * earned — these are sequential steps, not decoration.
 *
 * The panel carries `dark`, which is a plain class in tokens.css and so
 * re-binds every `--polli-*` token for this subtree only. That means the
 * normal theme utilities resolve to their on-dark values here; nothing needs
 * a hardcoded light colour.
 *
 * It also breaks out toward the sheet edge: sections sit at the sheet's 72px
 * padding, this sits at 24px — the mockup's proportion, and part of why the
 * dark band reads as a moment rather than as another section. It is the only
 * element that breaks out; two would make neither of them special.
 */
export function MoneyMoves() {
    return (
        <section className="dark -mx-2 grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-center gap-12 rounded-3xl bg-brand-dark px-8 py-14 md:-mx-12 md:px-14">
            <div className="flex flex-col gap-5">
                <SectionHeader
                    eyebrow="How the money moves"
                    title={<>Your app doesn&rsquo;t need a budget to launch.</>}
                    subtitle="On most platforms every user you win costs you money. Here, users hold their own Pollen — bought, or earned free by completing Quests — so usage scales without a bill landing on you, and a share of what they spend comes back to you."
                />
                <div className="mt-1 flex flex-wrap items-center gap-5">
                    {/* `bright`, not `accent` — see the tone table in kit.tsx:
                        bg-active flips muddy inside `.dark`. */}
                    <ActionButton
                        href="https://enter.pollinations.ai"
                        tone="bright"
                    >
                        Start earning
                    </ActionButton>
                    <ArrowLink
                        href="https://gen.pollinations.ai/docs"
                        className="text-theme-text-strong"
                    >
                        See how the split works
                    </ArrowLink>
                </div>
            </div>

            <ol className="flex flex-col gap-3">
                {STEPS.map((step, index) => (
                    <li key={step}>
                        <Surface
                            variant="card-themed"
                            className="flex items-start gap-4 rounded-2xl p-5"
                        >
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-theme-bg-active font-pixel text-sm text-theme-text-strong">
                                {index + 1}
                            </span>
                            <p className="text-sm leading-relaxed text-theme-text-base">
                                {step}
                            </p>
                        </Surface>
                    </li>
                ))}
            </ol>
        </section>
    );
}
