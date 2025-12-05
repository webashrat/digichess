import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface DigiQuizChartProps {
  correct: number;
  wrong: number;
}

const COLORS = {
  correct: '#4caf50',
  incorrect: '#f44336'
};

export default function DigiQuizChart({ correct, wrong }: DigiQuizChartProps) {
  const total = correct + wrong;
  
  const data = [
    { 
      name: 'Correct', 
      value: correct, 
      percentage: total > 0 ? (correct / total * 100) : 0, 
      color: COLORS.correct 
    },
    { 
      name: 'Incorrect', 
      value: wrong, 
      percentage: total > 0 ? (wrong / total * 100) : 0, 
      color: COLORS.incorrect 
    },
  ].filter(item => item.value > 0);

  if (data.length === 0 || total === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20, fontSize: 12 }}>
        No guesses yet
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, textAlign: 'center' }}>
        Total Guesses ({total})
      </div>
      <div style={{ width: '100%', height: 130, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={false}
              outerRadius={40}
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
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: 8, 
          marginTop: 2,
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
    </div>
  );
}

