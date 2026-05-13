"use client";
import {
	LineChart,
	Line,
	ResponsiveContainer,
	XAxis,
	YAxis,
	Tooltip,
	ReferenceLine,
	CartesianGrid,
} from "recharts";

interface Point {
	t: number; // ms
	v: number;
}

export function ChartCard({ points, threshold }: { points: Point[]; threshold: number | null }) {
	if (points.length === 0) {
		return (
			<div className="h-64 grid place-items-center text-inkDim text-sm">
				No readings in this range yet.
			</div>
		);
	}
	return (
		<div className="h-64 md:h-80">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
					<CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
					<XAxis
						dataKey="t"
						type="number"
						domain={["dataMin", "dataMax"]}
						tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
						stroke="currentColor"
						opacity={0.5}
						fontSize={11}
						tickMargin={6}
					/>
					<YAxis
						domain={["dataMin - 3", "dataMax + 3"]}
						tickFormatter={(v) => `${Math.round(v)}°`}
						stroke="currentColor"
						opacity={0.5}
						fontSize={11}
						width={40}
					/>
					<Tooltip
						labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
						formatter={(v) => [`${Number(v).toFixed(1)} °C`, "Temperature"]}
						contentStyle={{
							background: "var(--tw-bg-opacity, rgba(255,255,255,0.95))",
							border: "1px solid var(--c-border)",
							borderRadius: 8,
							fontSize: 12,
						}}
					/>
					{threshold !== null && (
						<ReferenceLine
							y={threshold}
							stroke="#ED1D25"
							strokeDasharray="4 4"
							label={{ value: `threshold ${threshold}°`, position: "insideBottomRight", fontSize: 10, fill: "#ED1D25" }}
						/>
					)}
					<Line type="monotone" dataKey="v" stroke="#00BBE4" strokeWidth={2} dot={false} isAnimationActive={false} />
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
