import {
    ACTION_INDICATORS,
    type Action,
    MESSAGE_PREFIXES,
    MESSAGE_STYLES,
    type MessageDisplayProps,
} from "@/types";

const getActionIndicator = (action: Action) => {
    const indicator =
        ACTION_INDICATORS[action as keyof typeof ACTION_INDICATORS];

    if (!indicator) return null;

    return (
        <div className={`animate-pulse ${indicator.className} text-3xl mt-4`}>
            {indicator.symbol.padEnd(16, " ").repeat(3)}
        </div>
    );
};

export const MessageDisplay = ({ msg, gameState }: MessageDisplayProps) => (
    <div className={`p-2 ${MESSAGE_STYLES[msg.persona]}`}>
        {MESSAGE_PREFIXES[msg.persona]}
        {msg.message}
        {msg.persona === "elevator" &&
            gameState.currentPersona === "elevator" &&
            getActionIndicator(msg.action)}
    </div>
);
