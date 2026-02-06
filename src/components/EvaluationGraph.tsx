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
  onPointSelect?: (moveNumber: number) => void;
  activeMoveIndex?: number | null;
}

export function EvaluationGraph({
  moves,
  height = 200,
  width,
  onPointSelect,
  activeMoveIndex = null
}: EvaluationGraphProps) {
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

    const padding = { top: 16, right: 14, bottom: 26, left: 34 };
    const chartWidth = graphWidth - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Fixed scale for visual consistency
    const maxEval = 9;
    const minEval = -9;
    const evalRange = maxEval - minEval;
    const zeroY = padding.top + chartHeight / 2;
    const toY = (value: number) => {
      const clamped = Math.max(minEval, Math.min(maxEval, value));
      const ratio = (clamped - minEval) / evalRange;
      return padding.top + chartHeight - ratio * chartHeight;
    };
    
    const points = moves.map((move, idx) => {
      let y: number;
      let hasMate = false;
      let displayValue: string = '';
      
      let tone = 0;
      if (move.mate !== null && move.mate !== undefined) {
        // Mate scores: positive mate = white winning, negative = black winning
        // Map to chart: positive mate -> top, negative mate -> bottom
        y = move.mate > 0 ? padding.top + 6 : padding.top + chartHeight - 6;
        hasMate = true;
        displayValue = `M${Math.abs(move.mate)}`;
        tone = move.mate > 0 ? 1 : -1;
      } else if (move.eval !== null && move.eval !== undefined) {
        const clampedEval = Math.max(minEval, Math.min(maxEval, move.eval));
        y = toY(clampedEval);
        displayValue = `${clampedEval > 0 ? '+' : ''}${clampedEval.toFixed(1)}`;
        tone = move.eval > 0 ? 1 : move.eval < 0 ? -1 : 0;
      } else {
        // No evaluation available
        y = zeroY;
        displayValue = 'N/A';
      }

      const x = padding.left + (idx / Math.max(1, moves.length - 1)) * chartWidth;
      
      const color =
        tone > 0 ? '#4caf50' : tone < 0 ? '#ef5350' : 'rgba(255, 255, 255, 0.6)';
      return {
        x,
        y,
        move,
        hasMate,
        displayValue,
        isPositive: tone > 0,
        evalValue: move.eval,
        color
      };
    });

    const totalMoves = moves.length;
    const sectionBoundaries = [
      totalMoves > 8 ? 8 : null,
      totalMoves > 30 ? 30 : null
    ].filter((v): v is number => v !== null);

    const sections = (() => {
      if (totalMoves <= 8) {
        return [{ label: 'Opening', startIdx: 0, endIdx: Math.max(0, totalMoves - 1) }];
      }
      if (totalMoves <= 30) {
        return [
          { label: 'Opening', startIdx: 0, endIdx: 7 },
          { label: 'Middlegame', startIdx: 8, endIdx: Math.max(8, totalMoves - 1) }
        ];
      }
      return [
        { label: 'Opening', startIdx: 0, endIdx: 7 },
        { label: 'Middlegame', startIdx: 8, endIdx: 29 },
        { label: 'Endgame', startIdx: 30, endIdx: Math.max(30, totalMoves - 1) }
      ];
    })();

    return { points, padding, chartWidth, chartHeight, maxEval, minEval, zeroY, toY, sectionBoundaries, sections };
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

  const { points, padding, chartWidth, chartHeight, maxEval, minEval, zeroY, toY, sectionBoundaries, sections } = graphData;

  // Create path for the evaluation line
  const pathData = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // Create area path (for filled area under the line)
  const areaPath = `${pathData} L ${padding.left + chartWidth} ${zeroY} L ${padding.left} ${zeroY} Z`;
  const tickValues = [9, 6, 3, 0, -3, -6, -9];

  return (
    <div ref={containerRef} style={{ width: width || '100%', height }}>
      <svg width={graphWidth} height={height} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="graphGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#4caf50" stopOpacity={0.35} />
            <stop offset="48%" stopColor="#4caf50" stopOpacity={0.12} />
            <stop offset="52%" stopColor="#ef5350" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#ef5350" stopOpacity={0.35} />
          </linearGradient>
          <linearGradient id="graphBg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.06)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.02)" />
          </linearGradient>
        </defs>

        {/* Background */}
        <rect
          x={padding.left}
          y={padding.top}
          width={chartWidth}
          height={chartHeight}
          fill="url(#graphBg)"
          stroke="rgba(255, 255, 255, 0.22)"
          strokeWidth={1}
          rx={8}
        />

        {/* Phase separators */}
        {sectionBoundaries.map((boundary) => {
          const boundaryIdx = Math.min(points.length - 1, Math.max(0, boundary - 1));
          const x = padding.left + (boundaryIdx / Math.max(1, points.length - 1)) * chartWidth;
          return (
            <line
              key={`phase-${boundary}`}
              x1={x}
              y1={padding.top}
              x2={x}
              y2={padding.top + chartHeight}
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          );
        })}

        {/* Phase labels */}
        {sections.map((section) => {
          const midIdx = (section.startIdx + section.endIdx) / 2;
          const x = padding.left + (midIdx / Math.max(1, points.length - 1)) * chartWidth;
          return (
            <text
              key={`phase-label-${section.label}`}
              x={x}
              y={padding.top + 12}
              fill="rgba(255, 255, 255, 0.55)"
              fontSize={9}
              fontWeight={600}
              textAnchor="middle"
            >
              {section.label}
            </text>
          );
        })}

        {/* Grid lines + labels */}
        {tickValues.map((value) => {
          const y = toY(value);
          const isEdge = value === maxEval || value === minEval;
          const isCenter = value === 0;
          const stroke = isEdge
            ? 'rgba(255, 255, 255, 0.45)'
            : isCenter
            ? 'rgba(255, 255, 255, 0.18)'
            : 'rgba(255, 255, 255, 0.12)';
          const dash = isCenter ? '4,4' : undefined;
          const label = value > 0 ? `+${value}` : value.toString();
          return (
            <g key={value}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + chartWidth}
                y2={y}
                stroke={stroke}
                strokeWidth={isEdge ? 1.2 : 1}
                strokeDasharray={dash}
              />
              <text
                x={padding.left - 10}
                y={y}
                fill={isEdge ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)'}
                fontSize={9}
                textAnchor="end"
                dominantBaseline="middle"
                fontWeight={isEdge ? 700 : 500}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Filled area under the curve */}
        <path d={areaPath} fill="url(#graphGradient)" opacity={0.55} />

        {/* Evaluation line segments */}
        {points.slice(1).map((point, idx) => {
          const prev = points[idx];
          const tone =
            point.evalValue !== null && point.evalValue !== undefined
              ? point.evalValue
              : prev.evalValue !== null && prev.evalValue !== undefined
              ? prev.evalValue
              : point.isPositive
              ? 1
              : prev.isPositive
              ? 1
              : -1;
          const color =
            tone > 0 ? '#4caf50' : tone < 0 ? '#ef5350' : 'rgba(255, 255, 255, 0.6)';
          return (
            <path
              key={idx}
              d={`M ${prev.x} ${prev.y} L ${point.x} ${point.y}`}
              fill="none"
              stroke={color}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* Data points */}
        {points.map((point, idx) => {
          const moveIndex = point.move?.move_number ? point.move.move_number - 1 : null;
          const isActive = moveIndex !== null && activeMoveIndex !== null && moveIndex === activeMoveIndex;
          return (
          <g
            key={idx}
            onClick={() => {
              if (!onPointSelect || !point.move?.move_number) return;
              onPointSelect(point.move.move_number);
            }}
            style={{ cursor: onPointSelect ? 'pointer' : 'default' }}
          >
            {isActive && (
              <circle
                cx={point.x}
                cy={point.y}
                r={point.hasMate ? 7 : 6}
                fill="none"
                stroke="rgba(255, 255, 255, 0.9)"
                strokeWidth={1.5}
              />
            )}
            <circle
              cx={point.x}
              cy={point.y}
              r={point.hasMate ? 4 : 2.6}
              fill={point.color}
              stroke="rgba(255, 255, 255, 0.7)"
              strokeWidth={point.hasMate ? 2 : 1.4}
              opacity={point.hasMate ? 1 : 0.95}
            />
            <title>
              {point.move.move_number}. {point.move.move} - {point.displayValue}
            </title>
          </g>
        )})}
      </svg>
    </div>
  );
}

