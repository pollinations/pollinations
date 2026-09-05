type HeroStat = {
    value: string;
    label: string;
};

type HeroStatsProps = {
    stats: HeroStat[];
};

const PLACEHOLDER_COUNT = 4;

export function HeroStats({ stats }: HeroStatsProps) {
    const loading = stats.length === 0;
    const slots = loading
        ? Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => ({
              value: null,
              label: null,
              key: `placeholder-${index}`,
          }))
        : stats.map((stat) => ({ ...stat, key: stat.label }));

    return (
        <dl
            className="mt-2 grid grid-cols-4 gap-3 sm:flex sm:flex-wrap sm:gap-8"
            aria-busy={loading}
        >
            {slots.map((slot) => (
                <div key={slot.key} className="flex min-w-0 flex-col gap-1">
                    <dt className="order-2 text-xs text-theme-text-muted">
                        {slot.label ?? (
                            <span
                                aria-hidden="true"
                                className="block h-3 w-20 max-w-full animate-pulse rounded bg-theme-bg-subtle"
                            />
                        )}
                    </dt>
                    <dd className="order-1 font-heading text-2xl text-theme-text-soft tabular-nums sm:text-4xl">
                        {slot.value ?? (
                            <span
                                aria-hidden="true"
                                className="block h-9 w-24 max-w-full animate-pulse rounded-md bg-theme-bg-subtle"
                            />
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
