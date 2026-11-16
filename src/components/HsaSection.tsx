import {
  Accordion, AccordionSummary, AccordionDetails,
  Typography, TextField, Grid, FormControl, InputLabel, Select, MenuItem, FormControlLabel, Checkbox,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTaxStore } from '../store/taxStore';
import NumberField from './NumberField';
import type { HsaCoverage } from '../types/input';

export default function HsaSection() {
  const input = useTaxStore((s) => s.input);
  const setField = useTaxStore((s) => s.setField);
  const enabled = input.health_savings_account;

  return (
    <Accordion defaultExpanded={enabled}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" sx={{ opacity: enabled ? 1 : 0.5 }}>
          Health Savings Account (Form 8889)
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <FormControlLabel
          control={<Checkbox checked={enabled} onChange={(e) => setField('health_savings_account', e.target.checked)} />}
          label="I had an HSA this year"
        />
        {enabled && (
          <>
            <Grid container spacing={1} sx={{ mt: 1 }}>
              <Grid size={{ xs: 6, sm: 4 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Coverage</InputLabel>
                  <Select
                    value={input.health_savings_account_coverage} label="Coverage"
                    onChange={(e) => setField('health_savings_account_coverage', e.target.value as HsaCoverage)}
                  >
                    <MenuItem value="self">Self-only</MenuItem>
                    <MenuItem value="family">Family</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <NumberField label="Your contributions" value={input.health_savings_account_contributions} onChange={(v) => setField('health_savings_account_contributions', v)} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <NumberField label="Employer contributions (W-2 box 12 W)" value={input.health_savings_account_employer_contributions} onChange={(v) => setField('health_savings_account_employer_contributions', v)} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <NumberField label="Distributions (1099-SA)" value={input.health_savings_account_distributions} onChange={(v) => setField('health_savings_account_distributions', v)} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField
                  label="Qualified medical expenses paid" type="number" size="small" fullWidth
                  value={input.health_savings_account_qualified_medical_expenses ?? ''}
                  placeholder="all distributions"
                  onChange={(e) => setField('health_savings_account_qualified_medical_expenses',
                    e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                  helperText="Blank = all distributions were qualified"
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FormControlLabel
                  control={<Checkbox checked={input.health_savings_account_distribution_exception} onChange={(e) => setField('health_savings_account_distribution_exception', e.target.checked)} />}
                  label="65+, disabled or deceased (no 20% additional tax)"
                />
              </Grid>
            </Grid>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              Part III, testing period (only if you stopped being HDHP-eligible)
            </Typography>
            <Grid container spacing={1} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 6, sm: 4 }}>
                <NumberField label="Last-month rule income" value={input.health_savings_account_last_month_rule_income} onChange={(v) => setField('health_savings_account_last_month_rule_income', v)} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <NumberField label="Qualified HSA funding distribution income" value={input.health_savings_account_funding_distribution_income} onChange={(v) => setField('health_savings_account_funding_distribution_income', v)} fullWidth />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FormControlLabel
                  control={<Checkbox checked={input.health_savings_account_testing_period_exception} onChange={(e) => setField('health_savings_account_testing_period_exception', e.target.checked)} />}
                  label="Due to death or disability (no 10% tax)"
                />
              </Grid>
            </Grid>
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
