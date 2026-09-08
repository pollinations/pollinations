import { AppHeader } from "../../compositions/AppHeader.tsx";
import { ColorModeToggle } from "../../primitives/ColorModeToggle.tsx";
import { Heading } from "../../primitives/Typography.tsx";
import { PollinationsSignInButton } from "./PollinationsSignInButton.tsx";

export function DashboardSignIn({
    appName,
    onSignIn,
}: {
    appName: string;
    onSignIn: () => void;
}) {
    return (
        <div className="polli:min-h-screen polli:bg-app-bg">
            <AppHeader navLabel={`${appName} links`}>
                <ColorModeToggle />
            </AppHeader>
            <main className="polli:mx-auto polli:flex polli:w-full polli:max-w-md polli:flex-col polli:gap-12 polli:px-6 polli:py-24 polli:text-center polli:sm:py-32">
                <Heading as="h1" size="section" className="polli:text-4xl">
                    {appName}
                </Heading>
                <div className="polli:flex polli:flex-col polli:gap-4">
                    <Heading as="h2" size="subsection">
                        Sign in
                    </Heading>
                    <PollinationsSignInButton
                        className="polli:w-full"
                        onClick={onSignIn}
                    />
                </div>
            </main>
        </div>
    );
}
