"use client";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

export function SparklineClient({ points }: { points: { t: number; v: number }[] }) {
	return (
		<ResponsiveContainer width="100%" height="100%">
			<LineChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
				<YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
				<Line type="monotone" dataKey="v" stroke="#00BBE4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
			</LineChart>
		</ResponsiveContainer>
	);
}
