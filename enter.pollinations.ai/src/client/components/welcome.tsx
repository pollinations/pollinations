interface WelcomeProps {
    isAuthenticated: boolean;
}

const PETAL_SHAPES = {
    purple: '80% 20% 70% 30% / 60% 65% 35% 40%',
    pink: '25% 75% 70% 30% / 55% 60% 40% 45%',
    blue: '70% 30% 30% 70% / 60% 40% 60% 40%',
    green: '30% 70% 60% 40% / 40% 50% 50% 60%',
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
                Sign in with <span className="italic">GitHub</span> to enter your creative space.
            </p>
            
            <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto">
                    <div className="flex flex-col items-center text-center space-y-3 p-4 bg-purple-50/50 border border-purple-100" style={{ borderRadius: PETAL_SHAPES.purple }}>
                        <span className="text-4xl">✨</span>
                        <p className="text-sm leading-relaxed">
                            <span className="font-bold text-purple-600">Create</span> <span className="italic text-pink-500">images</span>, <span className="underline text-blue-500">words</span>, <span className="font-semibold text-green-500">sounds</span> —<br />anything.
                        </p>
                    </div>
                    <div className="flex flex-col items-center text-center space-y-3 p-4 bg-pink-50/50 border border-pink-100" style={{ borderRadius: PETAL_SHAPES.pink }}>
                        <span className="text-4xl">🌸</span>
                        <p className="text-sm leading-relaxed">
                            <span className="font-bold text-pink-500">Earn</span> <span className="italic">daily</span> <span className="font-bold text-purple-600">Pollen</span><br />and use it to<br /><span className="italic underline text-green-600">generate</span>.
                        </p>
                    </div>
                    <div className="flex flex-col items-center text-center space-y-3 p-4 bg-blue-50/50 border border-blue-100" style={{ borderRadius: PETAL_SHAPES.blue }}>
                        <span className="text-4xl">🔑</span>
                        <p className="text-sm leading-relaxed">
                            <span className="font-bold text-blue-600">Manage</span> your<br /><span className="italic text-purple-500">balance</span> and<br /><span className="underline text-pink-500">API keys</span>.
                        </p>
                    </div>
                    <div className="flex flex-col items-center text-center space-y-3 p-4 bg-green-50/50 border border-green-100" style={{ borderRadius: PETAL_SHAPES.green }}>
                        <span className="text-4xl">🧩</span>
                        <p className="text-sm leading-relaxed">
                            <span className="font-bold text-green-600">Build</span> <span className="italic">your own</span><br /><span className="underline text-purple-600">AI-powered</span><br />apps.
                        </p>
                    </div>
                </div>
                <p className="text-gray-600 mt-6 text-lg">
                    It's all connected — simple, playful, and yours.
                </p>
            </div>
        </div>
    );
}
