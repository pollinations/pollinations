import LogoSvg from "../assets/logo.svg?react";

interface LogoProps {
    className?: string;
    mainColor?: string;
    shadeColor?: string;
}

export function Logo({
    className = "w-20 h-20",
    mainColor = "var(--t036)",
    shadeColor = "var(--t037)",
}: LogoProps) {
    return (
        <LogoSvg
            className={className}
            style={{
                color: mainColor,
                filter: `drop-shadow(4px 4px 0px ${shadeColor})`,
            }}
        />
    );
}
