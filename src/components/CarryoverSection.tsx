import {
  Accordion, AccordionSummary, AccordionDetails,
  Typography, Grid,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTaxStore } from '../store/taxStore';
import NumberField from './NumberField';
import type { PriorYear } from '../types/input';

export default function CarryoverSection() {
  const priorYear = useTaxStore((s) => s.input.prior_year);
  const setField = useTaxStore((s) => s.setField);

  const update = (data: Partial<PriorYear>) => {
    setField('prior_year', {
      taxable_income: 0,
      schedule_d_net_short_term: 0,
      schedule_d_net_long_term: 0,
      schedule_d_loss_deduction: 0,
      ...priorYear,
      ...data,
    });
  };

  const py = priorYear || { taxable_income: 0, schedule_d_net_short_term: 0, schedule_d_net_long_term: 0, schedule_d_loss_deduction: 0 };
  const hasValues = priorYear !== null;

  return (
    <Accordion defaultExpanded={false}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" sx={{ opacity: hasValues ? 1 : 0.5 }}>
          Prior Year Carryover (optional)
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Only fill this in if you had capital losses or excess foreign tax credit from the prior year.
          You can import last year's <code>carryover.json</code> output, or enter the values manually.
          Leave blank if not applicable.
        </Typography>
        <Grid container spacing={1}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <NumberField label="Taxable Income" value={py.taxable_income} onChange={(v) => update({ taxable_income: v })} fullWidth />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <NumberField label="Sched D Net Short-Term" value={py.schedule_d_net_short_term} onChange={(v) => update({ schedule_d_net_short_term: v })} fullWidth />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <NumberField label="Sched D Net Long-Term" value={py.schedule_d_net_long_term} onChange={(v) => update({ schedule_d_net_long_term: v })} fullWidth />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <NumberField label="Sched D Loss Deduction" value={py.schedule_d_loss_deduction} onChange={(v) => update({ schedule_d_loss_deduction: v })} fullWidth />
          </Grid>
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
}
