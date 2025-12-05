import { useMemo, useRef, useEffect, useState } from 'react';

interface EvaluationPoint {
  move_number: number;
  move: string;
  eval: number | null;
  mate: number | null;
}

interface EvaluationGraphProps {
  moves: EvaluationPoint[];
  height?: number;
  width?: number;
}

export function EvaluationGraph({ moves, height = 200, width }: EvaluationGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(width || 280);

  useEffect(() => {
    if (!width && containerRef.current) {
      const updateWidth = () => {
        setGraphWidth(containerRef.current?.clientWidth || 280);
      };
      updateWidth();
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, [width]);

  const graphData = useMemo(() => {
    if (!moves || moves.length === 0) return null;

    const padding = { top: 15, right: 15, bottom: 25, left: 35 };
    const chartWidth = graphWidth - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find the actual range of evaluations to scale properly
    let maxEval = 5;
    let minEval = -5;
    let hasMateScores = false;
    
    moves.forEach(move => {
      if (move.mate !== null && move.mate !== undefined) {
        hasMateScores = true;
      } else if (move.eval !== null && move.eval !== undefined) {
        maxEval = Math.max(maxEval, Math.abs(move.eval));
        minEval = Math.min(minEval, -Math.abs(move.eval));
      }
    });
    
    // Add some padding to the scale
    maxEval = Math.ceil(maxEval * 1.1);
    minEval = Math.floor(minEval * 1.1);
    
    const points = moves.map((move, idx) => {
      let y: number;
      let hasMate = false;
      let displayValue: string = '';
      
      if (move.mate !== null && move.mate !== undefined) {
        // Mate scores: positive mate = white winning, negative = black winning
        // Map to chart: positive mate -> top, negative mate -> bottom
        y = move.mate > 0 
          ? padding.top + 8 // Near top for white mate
          : padding.top + chartHeight - 8; // Near bottom for black mate
        hasMate = true;
        displayValue = `M${Math.abs(move.mate)}`;
      } else if (move.eval !== null && move.eval !== undefined) {
        // Normalize evaluation to chart coordinates
        // 0 evaluation = middle of chart
        const normalized = Math.max(minEval, Math.min(maxEval, move.eval));
        const ratio = normalized / Math.max(Math.abs(maxEval), Math.abs(minEval));
        y = padding.top + chartHeight / 2 - ratio * (chartHeight / 2);
        displayValue = `${move.eval > 0 ? '+' : ''}${move.eval.toFixed(1)}`;
      } else {
        // No evaluation available
        y = padding.top + chartHeight / 2;
        displayValue = 'N/A';
      }

      const x = padding.left + (idx / Math.max(1, moves.length - 1)) * chartWidth;
      
      return {
        x,
        y,
        move,
        hasMate,
        displayValue,
        isPositive: move.eval !== null ? move.eval > 0 : (move.mate !== null ? move.mate > 0 : false),
        evalValue: move.eval
      };
    });

    return { points, padding, chartWidth, chartHeight, maxEval, minEval, hasMateScores };
  }, [moves, graphWidth, height]);

  if (!graphData || graphData.points.length === 0) {
    return (
      <div style={{ 
        height, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: 'var(--muted)',
        fontSize: 12
      }}>
        No analysis data available
      </div>
    );
  }

  const { points, padding, chartWidth, chartHeight, maxEval, minEval, hasMateScores } = graphData;

  // Create path for the evaluation line
  const pathData = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // Create area path (for filled area under the line)
  const areaPath = `${pathData} L ${padding.left + chartWidth} ${padding.top + chartHeight / 2} L ${padding.left} ${padding.top + chartHeight / 2} Z`;

  return (
    <div ref={containerRef} style={{ width: width || '100%', height }}>
      <svg width={graphWidth} height={height} style={{ display: 'block' }}>
        {/* Background */}
        <rect
          x={padding.left}
          y={padding.top}
          width={chartWidth}
          height={chartHeight}
          fill="rgba(255, 255, 255, 0.02)"
        />

        {/* Grid lines */}
        {/* Center line (0 evaluation) */}
        <line
          x1={padding.left}
          y1={padding.top + chartHeight / 2}
          x2={padding.left + chartWidth}
          y2={padding.top + chartHeight / 2}
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={1}
          strokeDasharray="2,2"
        />

        {/* Y-axis labels */}
        <text
          x={padding.left - 8}
          y={padding.top + chartHeight / 2}
          fill="var(--muted)"
          fontSize={9}
          textAnchor="end"
          dominantBaseline="middle"
        >
          0.0
        </text>
        {!hasMateScores && (
          <>
            <text
              x={padding.left - 8}
              y={padding.top + 8}
              fill="var(--muted)"
              fontSize={9}
              textAnchor="end"
              dominantBaseline="middle"
            >
              +{maxEval.toFixed(1)}
            </text>
            <text
              x={padding.left - 8}
              y={padding.top + chartHeight - 8}
              fill="var(--muted)"
              fontSize={9}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {minEval.toFixed(1)}
            </text>
          </>
        )}
        {hasMateScores && (
          <>
            <text
              x={padding.left - 8}
              y={padding.top + 8}
              fill="#4caf50"
              fontSize={9}
              textAnchor="end"
              dominantBaseline="middle"
              fontWeight="600"
            >
              M
            </text>
            <text
              x={padding.left - 8}
              y={padding.top + chartHeight - 8}
              fill="#ef5350"
              fontSize={9}
              textAnchor="end"
              dominantBaseline="middle"
              fontWeight="600"
            >
              M
            </text>
          </>
        )}

        {/* Filled area under the curve */}
        <path
          d={areaPath}
          fill="url(#gradient)"
          opacity={0.3}
        />

        {/* Gradient definition */}
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#4caf50" stopOpacity={0.4} />
            <stop offset="50%" stopColor="#4caf50" stopOpacity={0.1} />
            <stop offset="50%" stopColor="#ef5350" stopOpacity={0.1} />
            <stop offset="100%" stopColor="#ef5350" stopOpacity={0.4} />
          </linearGradient>
        </defs>

        {/* Evaluation line */}
        <path
          d={pathData}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((point, idx) => (
          <g key={idx}>
            <circle
              cx={point.x}
              cy={point.y}
              r={point.hasMate ? 4 : 2.5}
              fill={point.isPositive ? '#4caf50' : '#ef5350'}
              stroke="var(--bg-primary)"
              strokeWidth={point.hasMate ? 2 : 1.5}
              opacity={point.hasMate ? 1 : 0.9}
            />
            {/* Tooltip on hover */}
            <title>
              {point.move.move_number}. {point.move.move} - {point.displayValue}
            </title>
          </g>
        ))}
      </svg>
    </div>
  );
}

