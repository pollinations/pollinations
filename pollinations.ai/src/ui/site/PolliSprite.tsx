/**
 * Polli, the brand bee, as a crisp pixel sprite: one path per colour on her
 * 35×34 grid, derived from packages/ui/src/brand/polli/polli.png. Her colours
 * are her own, not theme tokens. The wings are a separate group so CSS can
 * flap them. She faces right.
 */
const WINGS: [fill: string, d: string][] = [
    [
        "#010102",
        "M16 0h4v1h-4zM15 1h1v1h-1zM20 1h1v1h-1zM14 2h1v1h-1zM21 2h1v1h-1zM6 3h5v1h-5zM13 3h1v1h-1zM21 3h1v1h-1zM5 4h1v1h-1zM11 4h3v1h-3zM21 4h1v1h-1zM4 5h1v1h-1zM13 5h1v1h-1zM21 5h1v1h-1zM4 6h1v1h-1zM14 6h1v1h-1zM21 6h1v1h-1zM4 7h1v1h-1zM14 7h1v1h-1zM20 7h2v1h-2zM4 8h1v1h-1zM15 8h1v1h-1zM20 8h1v1h-1zM5 9h1v1h-1zM15 9h1v1h-1zM19 9h2v1h-2zM6 10h1v1h-1zM15 10h5v1h-5zM7 11h1v1h-1zM15 11h1v1h-1zM8 12h2v1h-2zM14 12h1v1h-1z",
    ],
    [
        "#b7e0f9",
        "M16 1h4v1h-4zM15 2h6v1h-6zM14 3h7v1h-7zM6 4h5v1h-5zM14 4h7v1h-7zM5 5h8v1h-8zM14 5h7v1h-7zM5 6h9v1h-9zM15 6h6v1h-6zM5 7h9v1h-9zM15 7h5v1h-5zM5 8h10v1h-10zM16 8h4v1h-4zM6 9h9v1h-9zM16 9h3v1h-3zM7 10h8v1h-8zM8 11h7v1h-7zM10 12h4v1h-4z",
    ],
];

const BODY: [fill: string, d: string][] = [
    [
        "#010102",
        "M23 4h2v1h-2zM22 5h3v1h-3zM31 5h2v1h-2zM22 6h1v1h-1zM29 6h4v1h-4zM22 7h1v1h-1zM29 7h1v1h-1zM21 8h1v1h-1zM28 8h2v1h-2zM21 9h8v1h-8zM29 10h1v1h-1zM17 11h1v1h-1zM20 11h9v1h-9zM30 11h1v1h-1zM16 12h1v1h-1zM19 12h1v1h-1zM28 12h2v1h-2zM31 12h1v1h-1zM6 13h2v1h-2zM10 13h4v1h-4zM16 13h1v1h-1zM18 13h1v1h-1zM30 13h2v1h-2zM5 14h2v1h-2zM15 14h1v1h-1zM17 14h1v1h-1zM32 14h1v1h-1zM5 15h1v1h-1zM15 15h1v1h-1zM17 15h1v1h-1zM32 15h1v1h-1zM4 16h1v1h-1zM14 16h4v1h-4zM33 16h1v1h-1zM4 17h1v1h-1zM13 17h1v1h-1zM18 17h1v1h-1zM33 17h2v1h-2zM2 18h2v1h-2zM13 18h1v1h-1zM18 18h1v1h-1zM21 18h2v1h-2zM29 18h2v1h-2zM33 18h2v1h-2zM0 19h2v1h-2zM13 19h1v1h-1zM18 19h1v1h-1zM21 19h2v1h-2zM29 19h2v1h-2zM33 19h2v1h-2zM1 20h3v1h-3zM13 20h1v1h-1zM18 20h1v1h-1zM21 20h2v1h-2zM29 20h2v1h-2zM33 20h2v1h-2zM3 21h1v1h-1zM14 21h1v1h-1zM18 21h1v1h-1zM21 21h2v1h-2zM29 21h2v1h-2zM33 21h2v1h-2zM4 22h1v1h-1zM15 22h3v1h-3zM21 22h2v1h-2zM29 22h2v1h-2zM33 22h1v1h-1zM4 23h1v1h-1zM33 23h1v1h-1zM5 24h1v1h-1zM24 24h1v1h-1zM27 24h1v1h-1zM33 24h1v1h-1zM5 25h2v1h-2zM25 25h2v1h-2zM33 25h1v1h-1zM6 26h2v1h-2zM32 26h1v1h-1zM8 27h1v1h-1zM32 27h1v1h-1zM9 28h3v1h-3zM30 28h2v1h-2zM9 29h6v1h-6zM29 29h2v1h-2zM8 30h3v1h-3zM13 30h16v1h-16zM8 31h2v1h-2zM12 31h3v1h-3zM19 31h2v1h-2zM23 31h2v1h-2zM12 32h2v1h-2zM18 32h3v1h-3zM22 32h3v1h-3zM18 33h2v1h-2zM22 33h2v1h-2z",
    ],
    [
        "#fbd668",
        "M20 12h8v1h-8zM8 13h1v1h-1zM19 13h11v1h-11zM7 14h1v1h-1zM11 14h3v1h-3zM18 14h13v1h-13zM6 15h2v1h-2zM10 15h3v1h-3zM18 15h14v1h-14zM5 16h2v1h-2zM10 16h3v1h-3zM18 16h15v1h-15zM5 17h2v1h-2zM10 17h2v1h-2zM19 17h14v1h-14zM5 18h2v1h-2zM10 18h2v1h-2zM19 18h2v1h-2zM23 18h6v1h-6zM31 18h2v1h-2zM5 19h2v1h-2zM10 19h2v1h-2zM19 19h2v1h-2zM23 19h6v1h-6zM31 19h2v1h-2zM5 20h2v1h-2zM10 20h2v1h-2zM19 20h2v1h-2zM23 20h6v1h-6zM31 20h2v1h-2zM5 21h2v1h-2zM10 21h2v1h-2zM19 21h2v1h-2zM23 21h6v1h-6zM31 21h2v1h-2zM6 22h1v1h-1zM10 22h2v1h-2zM18 22h3v1h-3zM23 22h6v1h-6zM31 22h2v1h-2zM10 23h2v1h-2zM16 23h3v1h-3zM22 23h8v1h-8zM10 24h2v1h-2zM16 24h3v1h-3zM22 24h2v1h-2zM25 24h2v1h-2zM28 24h2v1h-2zM10 25h3v1h-3zM16 25h9v1h-9zM27 25h6v1h-6zM11 26h2v1h-2zM16 26h16v1h-16zM17 27h14v1h-14zM20 28h9v1h-9z",
    ],
    [
        "#623129",
        "M16 11h1v1h-1zM15 12h1v1h-1zM9 13h1v1h-1zM14 13h2v1h-2zM8 14h3v1h-3zM14 14h1v1h-1zM31 14h1v1h-1zM8 15h2v1h-2zM13 15h2v1h-2zM7 16h3v1h-3zM13 16h1v1h-1zM7 17h3v1h-3zM12 17h1v1h-1zM4 18h1v1h-1zM7 18h3v1h-3zM12 18h1v1h-1zM2 19h3v1h-3zM7 19h3v1h-3zM12 19h1v1h-1zM4 20h1v1h-1zM7 20h3v1h-3zM12 20h1v1h-1zM4 21h1v1h-1zM7 21h3v1h-3zM12 21h2v1h-2zM7 22h3v1h-3zM12 22h3v1h-3zM7 23h3v1h-3zM12 23h4v1h-4zM7 24h3v1h-3zM12 24h4v1h-4zM8 25h2v1h-2zM13 25h3v1h-3zM8 26h3v1h-3zM13 26h3v1h-3zM9 27h2v1h-2zM13 27h4v1h-4zM14 28h4v1h-4zM15 29h4v1h-4z",
    ],
    [
        "#e6a34b",
        "M5 22h1v1h-1zM5 23h2v1h-2zM6 24h1v1h-1zM7 25h1v1h-1zM11 27h2v1h-2zM31 27h1v1h-1zM12 28h2v1h-2zM18 28h2v1h-2zM29 28h1v1h-1zM19 29h10v1h-10z",
    ],
    [
        "#ac9c90",
        "M20 10h9v1h-9zM18 11h2v1h-2zM29 11h1v1h-1zM17 12h2v1h-2zM30 12h1v1h-1zM17 13h1v1h-1zM16 14h1v1h-1zM16 15h1v1h-1zM15 17h2v1h-2zM14 18h3v1h-3zM14 19h1v1h-1zM16 19h1v1h-1zM14 20h3v1h-3z",
    ],
    [
        "#7a5e60",
        "M14 17h1v1h-1zM17 17h1v1h-1zM17 18h1v1h-1zM17 19h1v1h-1zM17 20h1v1h-1zM15 21h3v1h-3z",
    ],
    ["#f35bc2", "M19 23h3v1h-3zM30 23h3v1h-3zM19 24h3v1h-3zM30 24h3v1h-3z"],
    ["#bee861", "M15 19h1v1h-1z"],
];

export function PolliSprite({ className }: { className?: string }) {
    return (
        <svg
            aria-hidden="true"
            className={className}
            viewBox="0 0 35 34"
            shapeRendering="crispEdges"
        >
            <g className="site-polli-wings">
                {WINGS.map(([fill, d]) => (
                    <path key={fill} fill={fill} d={d} />
                ))}
            </g>
            {BODY.map(([fill, d]) => (
                <path key={fill} fill={fill} d={d} />
            ))}
        </svg>
    );
}
