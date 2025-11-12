interface MiniSparklineProps {
	data: number[];
	className?: string;
}

export function MiniSparkline({ data, className = "w-20 h-6" }: MiniSparklineProps) {
	if (data.length === 0) return null;

	const width = 100;
	const height = 20;
	const padding = 2;
	
	// Use min/max range instead of 0-max for better visibility
	const max = Math.max(...data);
	const min = Math.min(...data);
	const range = max - min || 1; // Avoid division by zero

	const points = data
		.map((value, i) => {
			const x = (i / Math.max(data.length - 1, 1)) * (width - padding * 2) + padding;
			const y = height - padding - ((value - min) / range) * (height - padding * 2);
			return `${x},${y}`;
		})
		.join(" ");

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className={className}
			preserveAspectRatio="none"
		>
			<polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
