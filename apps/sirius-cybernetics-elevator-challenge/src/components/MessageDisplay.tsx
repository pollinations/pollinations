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

export const MessageDisplay = ({ msg }: MessageDisplayProps) => (
    <div className={`p-2 ${MESSAGE_STYLES[msg.persona]}`}>
        {MESSAGE_PREFIXES[msg.persona]}
        {msg.message}
        {/* Show the up/down arrow for any line that actually moved a floor —
            the elevator in ch.1/2, the passenger in ch.3. (Marvin's shouts are
            "none", so they render nothing.) */}
        {getActionIndicator(msg.action)}
    </div>
);
