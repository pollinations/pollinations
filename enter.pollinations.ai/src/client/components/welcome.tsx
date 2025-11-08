interface WelcomeProps {
    isAuthenticated: boolean;
}

const BLOB_SHAPES = {
    purple: '50%',
    pink: '50%',
    blue: '50%',
    green: '50%',
};

function getTimeBasedGreeting() {
    const hour = new Date().getHours();
    
    if (hour >= 5 && hour < 12) {
        return "Good morning 🌅";
    } else if (hour >= 12 && hour < 17) {
        return "Good afternoon ☀️";
    } else if (hour >= 17 && hour < 22) {
        return "Good evening 🌆";
    } else {
        return "Hey there 🌙";
    }
}

export function Welcome({ isAuthenticated }: WelcomeProps) {
    if (isAuthenticated) {
        const greeting = getTimeBasedGreeting();
        
        return (
            <div className="text-center space-y-2">
                <p className="text-lg font-semibold text-gray-800">
                    {greeting}
                </p>
                <p className="text-base text-gray-600">
                    Your <span className="font-bold text-purple-600">Pollen</span>'s ready — let's make something <span className="italic text-green-600">cool</span>!
                </p>
            </div>
        );
    }

    return (
        <div className="text-center space-y-8 max-w-4xl mx-auto">
            <p className="text-2xl font-bold text-gray-800">
                Sign in with <span className="italic">GitHub</span>
            </p>
            
            <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto">
                    <div className="flex flex-col items-center text-center p-4">
                        <span className="text-4xl mb-2">👾</span>
                        <div className="space-y-1">
                            <span className="text-lg font-bold text-purple-600 block">Create</span>
                            <p className="text-sm leading-relaxed">
                                <span className="italic text-purple-500">images</span>, <span className="font-bold text-purple-500">words</span>,<br />
                                <span className="font-semibold text-purple-500">sounds</span> —<br />
                                anything.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col items-center text-center p-4">
                        <span className="text-4xl mb-2">🌸</span>
                        <div className="space-y-1">
                            <span className="text-lg font-bold text-pink-500 block">Earn</span>
                            <p className="text-sm leading-relaxed">
                                <span className="italic text-pink-500">daily</span> <span className="font-bold text-pink-500">Pollen</span><br />
                                and use it to<br />
                                <span className="italic font-bold text-pink-500">generate</span>.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col items-center text-center p-4">
                        <span className="text-4xl mb-2">💎</span>
                        <div className="space-y-1">
                            <span className="text-lg font-bold text-blue-600 block">Manage</span>
                            <p className="text-sm leading-relaxed">
                                your <span className="italic text-blue-500">balance</span><br />
                                and <span className="font-bold text-blue-500">API keys</span>.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col items-center text-center p-4">
                        <span className="text-4xl mb-2">🧩</span>
                        <div className="space-y-1">
                            <span className="text-lg font-bold text-green-600 block">Build</span>
                            <p className="text-sm leading-relaxed">
                                <span className="italic text-green-500">your own</span><br />
                                <span className="font-bold text-green-500">AI-powered</span><br />
                                apps.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
