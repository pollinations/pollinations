import { useEffect, useState } from "react";

interface UsageData {
	usage: Array<{
		hour: string;
		pollen_spent: number;
		requests: number;
	}>;
	total: number;
	maxDaily: number;
}

interface UsageSparklineProps {
	apiKeyId?: string;
	className?: string;
}

export function UsageSparkline({ apiKeyId, className }: UsageSparklineProps = {}) {
	const [data, setData] = useState<UsageData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

	useEffect(() => {
		const url = apiKeyId ? `/api/usage?keyId=${apiKeyId}` : "/api/usage";
		fetch(url, { credentials: "include" })
			.then((r) => {
				if (!r.ok) throw new Error("Failed to load usage");
				return r.json() as Promise<UsageData>;
			})
			.then(setData)
			.catch((e) => setError(e.message));
	}, [apiKeyId]);

	if (error) {
		return (
			<div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
				{error}
			</div>
		);
	}

	if (!data) {
		return (
			<div className="text-sm text-gray-500 px-3 py-2">Loading usage...</div>
		);
	}

	if (data.usage.length === 0) {
		return (
			<div className="text-sm text-gray-500 px-3 py-2">
				No usage data yet
			</div>
		);
	}

	const width = 400;
	const height = 80;
	const padding = 8;
	
	// Use min/max range with extra padding for better visibility
	const values = data.usage.map(d => d.pollen_spent);
	const max = Math.max(...values);
	const min = Math.min(...values);
	const range = max - min || 1;
	// Add 20% padding to top and bottom for more dramatic scaling
	const paddedMin = min - range * 0.2;
	const paddedMax = max + range * 0.2;
	const paddedRange = paddedMax - paddedMin;

	const points = data.usage
		.map((d, i) => {
			const x =
				(i / Math.max(data.usage.length - 1, 1)) * (width - padding * 2) +
				padding;
			const y =
				height -
				padding -
				((d.pollen_spent - paddedMin) / paddedRange) * (height - padding * 2);
			return `${x},${y}`;
		})
		.join(" ");

	const hoveredData = hoveredIndex !== null ? data.usage[hoveredIndex] : null;

	return (
		<div className="p-4">
			<div className="flex justify-between items-baseline mb-1">
				<div className="text-sm text-gray-600">Usage (3 days)</div>
				<div className="text-xs text-gray-500">
					{min.toFixed(2)} - {max.toFixed(2)} pollen
				</div>
			</div>
			<div className="text-2xl font-semibold mb-3">
				{hoveredData ? (
					<>
						{hoveredData.pollen_spent.toFixed(2)} pollen
						<span className="text-sm text-gray-500 ml-2">
							({new Date(hoveredData.hour).toLocaleString()})
						</span>
					</>
				) : (
					`${data.total.toFixed(2)} pollen`
				)}
			</div>
			<svg
				viewBox={`0 0 ${width} ${height}`}
				className="w-full h-20 mb-2"
				preserveAspectRatio="none"
			>
				<polyline
					points={points}
					fill="none"
					stroke="#8b5cf6"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				{data.usage.map((d, i) => {
					const x =
						(i / Math.max(data.usage.length - 1, 1)) *
							(width - padding * 2) +
						padding;
					const y =
						height -
						padding -
						((d.pollen_spent - paddedMin) / paddedRange) * (height - padding * 2);
					return (
						<g key={i}>
							{/* Invisible larger hit area for better hover */}
							<circle
								cx={x}
								cy={y}
								r="8"
								fill="transparent"
								className="cursor-pointer"
								onMouseEnter={() => setHoveredIndex(i)}
								onMouseLeave={() => setHoveredIndex(null)}
							/>
							{/* Visible dot */}
							<circle
								cx={x}
								cy={y}
								r={hoveredIndex === i ? "4" : "3"}
								fill="#8b5cf6"
								className="pointer-events-none transition-all"
								stroke="white"
								strokeWidth={hoveredIndex === i ? "2" : "0"}
							/>
						</g>
					);
				})}
			</svg>
			<div className="flex justify-between text-xs text-gray-500">
				{data.usage.length > 0 && (
					<>
						<span>{new Date(data.usage[0].hour).toLocaleDateString()}</span>
						<span>Now</span>
					</>
				)}
			</div>
		</div>
	);
}
