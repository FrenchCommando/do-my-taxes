import {
  Accordion, AccordionSummary, AccordionDetails,
  Typography, Button, TextField, Grid, IconButton, Box,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useTaxStore } from '../store/taxStore';
import NumberField from './NumberField';

export default function Section1098() {
  const entries = useTaxStore((s) => s.input['1098']);
  const { add1098, update1098, remove1098, addMortgagePayment, updateMortgagePayment, removeMortgagePayment } = useTaxStore();

  return (
    <Accordion defaultExpanded={entries.length > 0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" sx={{ opacity: entries.length > 0 ? 1 : 0.5 }}>
          1098 Mortgage ({entries.length})
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {entries.map((entry) => (
          <Box key={entry.id} sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <TextField label="Recipient" size="small" value={entry.Recipient} onChange={(e) => update1098(entry.id, { Recipient: e.target.value })} sx={{ flex: 1, mr: 1 }} />
              <IconButton onClick={() => remove1098(entry.id)} color="error" size="small"><DeleteIcon /></IconButton>
            </Box>
            <Grid container spacing={1} sx={{ mb: 1 }}>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField label="Loan Number" size="small" value={entry.LoanNumber} onChange={(e) => update1098(entry.id, { LoanNumber: e.target.value })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <NumberField label="Principal Balance" value={entry.PrincipalBalance} onChange={(v) => update1098(entry.id, { PrincipalBalance: v })} fullWidth />
              </Grid>
            </Grid>
            <Typography variant="caption" color="text.secondary">Payments</Typography>
            {entry.Payments.map((p, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                <TextField label="Date" size="small" type="date" value={p.Date} onChange={(e) => updateMortgagePayment(entry.id, i, { Date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <NumberField label="Interest" value={p.InterestAmount} onChange={(v) => updateMortgagePayment(entry.id, i, { InterestAmount: v })} />
                <NumberField label="Principal" value={p.PrincipalAmount} onChange={(v) => updateMortgagePayment(entry.id, i, { PrincipalAmount: v })} />
                <IconButton onClick={() => removeMortgagePayment(entry.id, i)} color="error" size="small"><DeleteIcon /></IconButton>
              </Box>
            ))}
            <Button startIcon={<AddIcon />} onClick={() => addMortgagePayment(entry.id)} variant="text" size="small">
              Add Payment
            </Button>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={add1098} variant="outlined" size="small">
          Add 1098
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}
