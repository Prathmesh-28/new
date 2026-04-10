"use client";

const DATA = [82, 78, 85, 75, 70, 62, 55, 48, 40, 35, 42, 50, 58, 65, 70, 68, 72, 78, 80, 76];

function getBarColor(value: number, index: number): string {
  const opacity = index < 10 ? 0.5 : 1;
  let baseColor: string;
  if (value < 50) {
    baseColor = "#ef4444"; // red
  } else if (value < 65) {
    baseColor = "#C9A227"; // gold
  } else {
    baseColor = "#96B83D"; // olive-light / green
  }
  return baseColor + (opacity < 1 ? "80" : "");
}

export default function BarChart() {
  const maxVal = Math.max(...DATA);

  return (
    <div className="flex items-end gap-1 h-20 w-full px-1">
      {DATA.map((value, i) => {
        const heightPct = (value / maxVal) * 100;
        const color = getBarColor(value, i);
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all"
            style={{
              height: `${heightPct}%`,
              backgroundColor: color,
              minWidth: 0,
            }}
            title={`Day ${i + 1}: ${value}`}
          />
        );
      })}
    </div>
  );
}
