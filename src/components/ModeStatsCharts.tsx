import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ModeStats } from '../api/types';

interface ModeStatsChartsProps {
  stats: ModeStats;
  modeName: string;
  modeColor: string;
}

const COLORS = {
  win: '#22c55e',
  loss: '#ef4444',
  correct: '#22c55e',
  incorrect: '#ef4444'
};

export default function ModeStatsCharts({ stats, modeName, modeColor }: ModeStatsChartsProps) {
  // Calculate losses (excluding draws)
  const losses = stats.games_played - stats.wins - (stats.draws || 0);
  const losePercentage = stats.games_played > 0 ? ((losses / stats.games_played) * 100) : 0;
  
  // Chart 1: Total games - Win% vs Lose%
  const totalData = [
    { name: 'Win', value: stats.wins, percentage: stats.win_percentage, color: COLORS.win },
    { name: 'Lose', value: losses, percentage: losePercentage, color: COLORS.loss },
  ].filter(item => item.value > 0);

  // Chart 2: Games as White - Win% vs Lose%
  const whiteWinCount = Math.round((stats.games_as_white * stats.win_percentage_white) / 100);
  const whiteLossCount = stats.games_as_white - whiteWinCount;
  const whiteData = [
    { name: 'Win', value: whiteWinCount, percentage: stats.win_percentage_white, color: COLORS.win },
    { name: 'Lose', value: whiteLossCount, percentage: 100 - stats.win_percentage_white, color: COLORS.loss },
  ].filter(item => item.value > 0);

  // Chart 3: Games as Black - Win% vs Lose%
  const gamesAsBlack = stats.games_played - stats.games_as_white;
  const blackWinCount = Math.round((gamesAsBlack * stats.win_percentage_black) / 100);
  const blackLossCount = gamesAsBlack - blackWinCount;
  const blackData = [
    { name: 'Win', value: blackWinCount, percentage: stats.win_percentage_black, color: COLORS.win },
    { name: 'Lose', value: blackLossCount, percentage: 100 - stats.win_percentage_black, color: COLORS.loss },
  ].filter(item => item.value > 0);

  const renderPieChart = (data: any[], title: string, height: number = 150) => {
    if (data.length === 0) {
      return (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20, fontSize: 12 }}>
          No data
        </div>
      );
    }

    return (
      <div style={{ marginBottom: 8, width: '100%' }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted)', marginBottom: 3, textAlign: 'center' }}>
          {title}
        </div>
        <div style={{ width: '100%', height: height, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={false}
                outerRadius={28}
                innerRadius={0}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number, name: string, props: any) => [
                  `${value} (${props.payload.percentage.toFixed(1)}%)`,
                  name
                ]}
                contentStyle={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '10px',
                  padding: '4px 8px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: 8, 
          marginTop: -2,
          fontSize: 9,
          flexWrap: 'wrap'
        }}>
          {data.map((entry, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ 
                width: 6, 
                height: 6, 
                borderRadius: '50%', 
                backgroundColor: entry.color 
              }} />
              <span style={{ color: 'var(--text)' }}>
                {entry.name} {entry.percentage.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: '100%' }}>
      {renderPieChart(totalData, `Total Games (${stats.games_played})`, 90)}
      {renderPieChart(whiteData, `White (${stats.games_as_white})`, 90)}
      {renderPieChart(blackData, `Black (${gamesAsBlack})`, 90)}
    </div>
  );
}

