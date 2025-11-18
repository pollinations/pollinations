import { Button } from "../components/ui/button";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import { Title, Heading, Body } from "../components/ui/typography";

function HelloPage() {
    return (
        <div className="w-full px-4 pb-12">
            <div className="max-w-4xl mx-auto">
                {/* Main Card */}
                <div className="bg-offwhite/90 border-r-4 border-b-4 border-rose shadow-rose-lg p-6 md:p-8">
                    {/* Title */}
                    <Title>Gen AI with a Human Touch</Title>
                    {/* Intro Section */}
                    <div className="mb-12">
                        <Body>
                            Tired of faceless, complex, and expensive APIs? We
                            are too. We're a small, passionate team building a
                            different kind of AI platform—one that's simple,
                            beautiful, and built in direct partnership with our
                            community.
                        </Body>
                        <Body spacing="none">
                            Whether you need a reliable API that just works or a
                            partner to sponsor your next big idea, you've found
                            your home.
                        </Body>
                    </div>

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Pollen Section */}
                    <div className="mb-12">
                        <Heading variant="section">
                            Pollen: One Simple Credit for Everything
                        </Heading>
                        <Body spacing="none">
                            Pollen is our single, unified credit for all
                            generative media. It's the elegant solution to a
                            chaotic landscape, designed to be predictable and
                            fair for every type of builder. It's the fuel for
                            your imagination, and there are multiple ways to
                            fill your tank.
                        </Body>
                    </div>

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Get Pollen Section */}
                    <div className="mb-12">
                        <Heading variant="section" spacing="comfortable">
                            Fuel Your Vision: Get Pollen Your Way
                        </Heading>
                        <Body spacing="comfortable">
                            Our platform is designed for flexibility. Every
                            developer can purchase Pollen directly, and those we
                            partner with also receive a daily grant to kickstart
                            their journey.
                        </Body>

                        {/* Two Column Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Buy Pollen Card */}
                            <div className="bg-offblack/5 p-6">
                                <h3 className="font-headline text-lg font-black text-lime mb-4 uppercase tracking-wider">
                                    Simple & Fast: Buy What You Need
                                </h3>
                                <Body size="sm" spacing="none">
                                    Have an idea and just need a great API to
                                    power it?{" "}
                                    <span className="font-black">
                                        Buy Pollen packs and start building in
                                        minutes.
                                    </span>{" "}
                                    No strings attached. It's the fast,
                                    reliable, pay-as-you-go solution for any
                                    project, from a weekend hackathon to a
                                    full-scale application.
                                </Body>
                            </div>

                            {/* Sponsorship Card */}
                            <div className="bg-offblack/5 p-6">
                                <h3 className="font-headline text-lg font-black text-rose mb-4 uppercase tracking-wider">
                                    Our Investment in You: The Sponsorship
                                    Program
                                </h3>
                                <Body size="sm" spacing="none">
                                    We sponsor developers building the next wave
                                    of creative apps. As a partner, you receive
                                    a{" "}
                                    <span className="font-black">
                                        free daily Pollen grant
                                    </span>{" "}
                                    to de-risk development and get your project
                                    off the ground. This daily grant is the
                                    perfect launchpad, and you can{" "}
                                    <span className="font-black">
                                        top up with purchased Pollen anytime
                                    </span>{" "}
                                    you need to scale.
                                </Body>
                            </div>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Sponsorship Tiers */}
                    <div className="mb-12">
                        <Heading variant="section">
                            Grow With Us: The Sponsorship Tiers
                        </Heading>
                        <Body spacing="none">
                            For our sponsored partners, the journey is a
                            gamified path that rewards your progress. You'll
                            start as a <span className="font-black">Spore</span>
                            , getting a daily grant to prototype with front-end
                            keys. As you build and contribute, you'll grow to{" "}
                            <span className="font-black">Seed</span>,{" "}
                            <span className="font-black">Flower</span>, and{" "}
                            <span className="font-black">Nectar</span>,
                            unlocking larger daily grants and server-to-server
                            keys to support your app's launch and scaling.
                        </Body>
                    </div>

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Creative Launchpad */}
                    <div className="mb-12">
                        <Heading variant="section">
                            Your Creative Launchpad
                        </Heading>
                        <Body spacing="comfortable">
                            No matter how you get your Pollen, you get access to
                            our high-level creative engines. We handle the
                            complexity so you can focus on your vision.
                        </Body>
                        <ul className="space-y-3">
                            <li className="font-body text-sm text-offblack/80 leading-relaxed pl-4 border-l-2 border-lime">
                                <span className="font-black">
                                    Build Intelligent Chatbots & Agents:
                                </span>{" "}
                                Deploy conversational AI with memory using our
                                end-to-end framework.
                            </li>
                            <li className="font-body text-sm text-offblack/80 leading-relaxed pl-4 border-l-2 border-lime">
                                <span className="font-black">
                                    Generate Consistent Visual Worlds:
                                </span>{" "}
                                Create characters and assets in a coherent style
                                for professional design tools.
                            </li>
                            <li className="font-body text-sm text-offblack/80 leading-relaxed pl-4 border-l-2 border-lime">
                                <span className="font-black">
                                    Orchestrate Multi-Step Workflows:
                                </span>{" "}
                                Chain models to create autonomous agents that
                                can research, summarize, and visualize.
                            </li>
                            <li className="font-body text-sm text-offblack/80 leading-relaxed pl-4 border-l-2 border-lime">
                                <span className="font-black">
                                    Craft Interactive Media (Coming Soon):
                                </span>{" "}
                                Go beyond static outputs with tools to generate
                                video, audio, and more.
                            </li>
                        </ul>
                    </div>

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* The Difference */}
                    <div className="mb-12">
                        <Heading variant="section">
                            The Pollinations Difference
                        </Heading>
                        <Body spacing="comfortable">
                            Why build with us? Because we're building{" "}
                            <span className="italic">for</span> you.
                        </Body>
                        <ul className="space-y-3">
                            <li className="font-body text-sm text-offblack/80 leading-relaxed pl-4 border-l-2 border-rose">
                                <span className="font-black">
                                    We're Accessible:
                                </span>{" "}
                                We're a small team you can talk to directly. No
                                support tickets lost in the void.
                            </li>
                            <li className="font-body text-sm text-offblack/80 leading-relaxed pl-4 border-l-2 border-rose">
                                <span className="font-black">
                                    We're Flexible:
                                </span>{" "}
                                Our roadmap is driven by you. We build the
                                features our community needs.
                            </li>
                            <li className="font-body text-sm text-offblack/80 leading-relaxed pl-4 border-l-2 border-rose">
                                <span className="font-black">
                                    We Love Beauty:
                                </span>{" "}
                                We believe tools should be charming and fun to
                                use.
                            </li>
                        </ul>
                    </div>

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* Roadmap */}
                    <div className="mb-12">
                        <Heading variant="section">
                            The Horizon: An Open Creative Economy
                        </Heading>
                        <Body spacing="comfortable">
                            Our roadmap is focused on enabling success for every
                            developer on our platform.
                        </Body>
                        <div className="space-y-4">
                            <div className="bg-offblack/5 p-4">
                                <div className="flex flex-col md:flex-row gap-3">
                                    <div className="font-headline text-xs font-black text-lime uppercase tracking-wider md:w-32">
                                        Coming Soon
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-headline text-sm font-black text-offblack mb-2">
                                            Secure Front-End Spending
                                        </p>
                                        <p className="font-body text-xs text-offblack/70">
                                            The foundational tech allowing
                                            client-side apps to spend Pollen, a
                                            key step for monetization.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-offblack/5 p-4">
                                <div className="flex flex-col md:flex-row gap-3">
                                    <div className="font-headline text-xs font-black text-lime uppercase tracking-wider md:w-32">
                                        Q1 2026
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-headline text-sm font-black text-offblack mb-2">
                                            In-App Purchase
                                        </p>
                                        <p className="font-body text-xs text-offblack/70">
                                            <span className="font-black">
                                                The economy opens.
                                            </span>{" "}
                                            Users can buy Pollen inside your
                                            app, and you get a bonus for every
                                            purchase. This is the goal for our
                                            sponsored partners.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-offblack/5 p-4">
                                <div className="flex flex-col md:flex-row gap-3">
                                    <div className="font-headline text-xs font-black text-lime uppercase tracking-wider md:w-32">
                                        Ongoing
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-headline text-sm font-black text-offblack mb-2">
                                            Beyond
                                        </p>
                                        <p className="font-body text-xs text-offblack/70">
                                            We're moving towards a complete
                                            solution for AI app development,
                                            including hosting and app discovery.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="my-12 border-t-2 border-offblack/10" />

                    {/* CTA */}
                    <div>
                        <Heading variant="section" spacing="comfortable">
                            Ready to Create?
                        </Heading>
                        <Body spacing="comfortable">
                            Stop choosing between power and personality. Build
                            with a platform that offers both.
                        </Body>
                        <div className="flex flex-wrap gap-3">
                            <a
                                href="https://enter.pollinations.ai"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-6 py-4 bg-offblack border-r-4 border-b-4 border-lime shadow-lime-md font-headline uppercase text-sm font-black text-offwhite hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all"
                            >
                                Get Your API Key & Start Building
                                <svg
                                    className="w-3.5 h-3.5 stroke-lime"
                                    fill="none"
                                    strokeWidth="2.5"
                                    viewBox="0 0 12 12"
                                    title="External link"
                                >
                                    <path
                                        d="M1 11L11 1M11 1H4M11 1v7"
                                        strokeLinecap="square"
                                    />
                                </svg>
                            </a>
                            <a
                                href="mailto:hello@pollinations.ai?subject=Sponsorship Inquiry"
                                className="inline-flex items-center gap-2 px-6 py-4 bg-lime/90 border-r-4 border-b-4 border-offblack shadow-black-md font-headline uppercase text-sm font-black hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-black-sm transition-all"
                            >
                                Learn More About Sponsorship
                                <svg
                                    className="w-3.5 h-3.5 stroke-offblack"
                                    fill="none"
                                    strokeWidth="2.5"
                                    viewBox="0 0 12 12"
                                    title="Email"
                                >
                                    <path
                                        d="M1 11L11 1M11 1H4M11 1v7"
                                        strokeLinecap="square"
                                    />
                                </svg>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default HelloPage;
