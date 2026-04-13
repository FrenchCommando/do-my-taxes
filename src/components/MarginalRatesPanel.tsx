import {
  Paper, Typography, Box, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTaxStore } from '../store/taxStore';

function pct(n: number) {
  return (n * 100).toFixed(2) + '%';
}

function fmt(n: number) {
  return '$' + n.toLocaleString();
}

export default function MarginalRatesPanel() {
  const marginalRates = useTaxStore((s) => s.marginalRates);
  if (!marginalRates) return null;

  const { marginal_rates: categories } = marginalRates;

  return (
    <Paper sx={{ p: 2, mt: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Marginal Tax Rates</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The rate on your next dollar of income (or deduction), broken down by federal, NY state, and NYC.
      </Typography>
      {Object.entries(categories).map(([name, category]) => {
        const currentRate = category.segments[0]?.rates;
        return (
          <Accordion key={name} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mr: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{name}</Typography>
                {currentRate && (
                  <Typography variant="body2" component="span" sx={{ fontWeight: 'bold', display: 'flex', gap: 2 }}>
                    <span>Fed {pct(currentRate.federal)}</span>
                    <span>NY {pct(currentRate.ny_state)}</span>
                    <span>NYC {pct(currentRate.nyc)}</span>
                    <span>= {pct(currentRate.combined)}</span>
                  </Typography>
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                {category.note}
              </Typography>
              <Divider sx={{ mb: 1 }} />
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Range</TableCell>
                      <TableCell align="right">Federal</TableCell>
                      <TableCell align="right">NY</TableCell>
                      <TableCell align="right">NYC</TableCell>
                      <TableCell align="right">Combined</TableCell>
                      <TableCell>Next threshold</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {category.segments.map((seg, i) => (
                      <TableRow key={i}>
                        <TableCell>{fmt(seg.from)} &ndash; {seg.to !== null ? fmt(seg.to) : '...'}</TableCell>
                        <TableCell align="right">{pct(seg.rates.federal)}</TableCell>
                        <TableCell align="right">{pct(seg.rates.ny_state)}</TableCell>
                        <TableCell align="right">{pct(seg.rates.nyc)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{pct(seg.rates.combined)}</TableCell>
                        <TableCell>
                          <Typography variant="caption">{seg.next_knot || ''}</Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Paper>
  );
}
