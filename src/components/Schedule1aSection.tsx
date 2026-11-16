import {
  Accordion, AccordionSummary, AccordionDetails,
  Typography, Button, TextField, Grid, IconButton, Box,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useTaxStore } from '../store/taxStore';
import NumberField from './NumberField';

/** Schedule 1-A (2025-2028): no tax on tips, overtime, car loan interest. The senior deduction uses the
 * birth dates in the Filing section. */
export default function Schedule1aSection() {
  const input = useTaxStore((s) => s.input);
  const { setField, addVehicleLoan, updateVehicleLoan, removeVehicleLoan } = useTaxStore();
  const hasValues = input.qualified_tips || input.qualified_tips_business || input.qualified_overtime
    || input.qualified_overtime_1099 || input.vehicle_loans.length > 0;

  return (
    <Accordion defaultExpanded={Boolean(hasValues)}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" sx={{ opacity: hasValues ? 1 : 0.5 }}>
          Tips, Overtime, Car Loan Interest (Schedule 1-A)
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Qualified amounts only: tips in an eligible occupation, the overtime premium (the "half" in
          time-and-a-half), interest on a loan for a new US-assembled personal vehicle. Eligibility is on you.
        </Typography>
        <Grid container spacing={1}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <NumberField label="Tips (W-2)" value={input.qualified_tips} onChange={(v) => setField('qualified_tips', v)} fullWidth />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <NumberField label="Tips (business)" value={input.qualified_tips_business} onChange={(v) => setField('qualified_tips_business', v)} fullWidth />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <NumberField label="Overtime (W-2)" value={input.qualified_overtime} onChange={(v) => setField('qualified_overtime', v)} fullWidth />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <NumberField label="Overtime (1099)" value={input.qualified_overtime_1099} onChange={(v) => setField('qualified_overtime_1099', v)} fullWidth />
          </Grid>
        </Grid>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, mb: 1, display: 'block' }}>
          Vehicle loans (up to 2 on the form)
        </Typography>
        {input.vehicle_loans.map((loan, index) => (
          <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField label="VIN" size="small" value={loan.VIN} onChange={(e) => updateVehicleLoan(index, { VIN: e.target.value })} sx={{ flex: 1 }} />
            <NumberField label="Interest paid" value={loan.Interest} onChange={(v) => updateVehicleLoan(index, { Interest: v })} />
            <NumberField label="Deducted on business schedule" value={loan.DeductedOnBusinessSchedule} onChange={(v) => updateVehicleLoan(index, { DeductedOnBusinessSchedule: v })} />
            <IconButton onClick={() => removeVehicleLoan(index)} color="error" size="small"><DeleteIcon /></IconButton>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={addVehicleLoan} variant="outlined" size="small" disabled={input.vehicle_loans.length >= 2}>
          Add Vehicle Loan
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}
