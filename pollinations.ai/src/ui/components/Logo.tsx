import LogoSvg from "../assets/logo.svg?react";

interface LogoProps {
    className?: string;
    mainColor?: string;
    shadeColor?: string;
}

export function Logo({
    className = "w-20 h-20",
    mainColor = "rgb(var(--logo-main))",
    shadeColor = "rgb(var(--logo-accent))",
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
