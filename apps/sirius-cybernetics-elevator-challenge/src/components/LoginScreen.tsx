interface LoginScreenProps {
    login: () => void;
}

export function LoginScreen({ login }: LoginScreenProps) {
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0f] text-green-400 p-4 font-mono">
            <div className="w-full max-w-md p-8 space-y-8 bg-gray-900/90 border-green-400 border-2 text-center">
                <div className="space-y-3">
                    <h1 className="text-3xl font-bold text-yellow-400 animate-pulse">
                        Sirius Cybernetics Corporation
                    </h1>
                    <h2 className="text-lg text-green-400">
                        Happy Vertical People Transporter
                    </h2>
                </div>

                <div className="space-y-4 text-sm text-green-400/70">
                    <pre className="text-green-400 text-xs leading-tight">
                        {`    ___________
   |  _______  |
   | |       | |
   | |  ???  | |
   | |       | |
   | |_______| |
   |___________|
   |  |     |  |
   |  |     |  |
   |__|_____|__|`}
                    </pre>
                    <p>
                        The elevator refuses to move for unauthorized personnel.
                        Please identify yourself.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={login}
                    className="w-full px-6 py-3 bg-green-400 text-black font-bold text-sm hover:bg-green-500 transition-colors border-2 border-green-400"
                >
                    Log In with Pollinations
                </button>

                <p className="text-[10px] text-green-400/40">
                    Share and Enjoy!&trade; &mdash; Sirius Cybernetics Corp.
                </p>
            </div>
        </div>
    );
}
