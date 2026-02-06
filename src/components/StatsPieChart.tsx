import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface StatsPieChartProps {
  wins: number;
  losses: number;
  draws: number;
}

const COLORS = {
  win: '#22c55e',
  loss: '#ef4444',
  draw: '#f59e0b'
};

export default function StatsPieChart({ wins, losses, draws }: StatsPieChartProps) {
  const data = [
    { name: 'Wins', value: wins, color: COLORS.win },
    { name: 'Losses', value: losses, color: COLORS.loss },
    { name: 'Draws', value: draws, color: COLORS.draw },
  ].filter(item => item.value > 0);

  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
        No games played yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, value, percent }) => {
            if (value === 0) return '';
            return `${(percent * 100).toFixed(0)}%`;
          }}
          outerRadius={60}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip 
          formatter={(value: number, name: string) => [`${value} ${name}`, '']}
          contentStyle={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
            fontSize: '12px'
          }}
        />
        <Legend 
          formatter={(value) => value}
          wrapperStyle={{ color: 'var(--text)', fontSize: '11px' }}
          iconType="circle"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

