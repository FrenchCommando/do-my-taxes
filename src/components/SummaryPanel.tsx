import { Paper, Typography, Box, Divider } from '@mui/material';
import { useTaxStore } from '../store/taxStore';

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function SummaryPanel() {
  const fullResult = useTaxStore((s) => s.fullResult);
  if (!fullResult) return null;

  const { summaryInfo } = fullResult;
  const entries = Object.entries(summaryInfo);

  // Group by form prefix
  const groups: Record<string, [string, number | boolean | string][]> = {};
  for (const [key, value] of entries) {
    const parts = key.split(' ');
    const formKey = parts[0];
    const label = parts.slice(1).join(' ');
    if (!groups[formKey]) groups[formKey] = [];
    groups[formKey].push([label, value]);
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Tax Summary</Typography>
      {Object.entries(groups).map(([formKey, items]) => (
        <Box key={formKey} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
            {formKey}
          </Typography>
          <Divider sx={{ mb: 0.5 }} />
          {items.map(([label, value]) => (
            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
              <Typography variant="body2" sx={{ mr: 2 }}>{label}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                {typeof value === 'number'
                  ? (label.includes('fraction') || label.includes('rate')
                    ? (value * 100).toFixed(2) + '%'
                    : fmt(value))
                  : String(value)}
              </Typography>
            </Box>
          ))}
        </Box>
      ))}
    </Paper>
  );
}
