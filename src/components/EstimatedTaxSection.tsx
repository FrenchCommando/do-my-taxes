import {
  Accordion, AccordionSummary, AccordionDetails,
  Typography, Button, TextField, IconButton, Box,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useTaxStore } from '../store/taxStore';
import NumberField from './NumberField';

export default function EstimatedTaxSection() {
  const { EstimatedIncomeTax } = useTaxStore((s) => s.input);
  const { addEstimatedPayment, updateEstimatedPayment, removeEstimatedPayment } = useTaxStore();
  const total = EstimatedIncomeTax.Federal.length + EstimatedIncomeTax.State.length;

  return (
    <Accordion defaultExpanded={total > 0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" sx={{ opacity: total > 0 ? 1 : 0.5 }}>
          Estimated Tax Payments ({total})
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Federal</Typography>
        {EstimatedIncomeTax.Federal.map((p, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField label="Date" size="small" type="date" value={p.Date} onChange={(e) => updateEstimatedPayment('Federal', i, { Date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <NumberField label="Amount" value={p.Amount} onChange={(v) => updateEstimatedPayment('Federal', i, { Amount: v })} />
            <IconButton onClick={() => removeEstimatedPayment('Federal', i)} color="error" size="small"><DeleteIcon /></IconButton>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={() => addEstimatedPayment('Federal')} variant="outlined" size="small" sx={{ mb: 2 }}>
          Add Federal Payment
        </Button>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>State</Typography>
        {EstimatedIncomeTax.State.map((p, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField label="Date" size="small" type="date" value={p.Date} onChange={(e) => updateEstimatedPayment('State', i, { Date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <NumberField label="Amount" value={p.Amount} onChange={(v) => updateEstimatedPayment('State', i, { Amount: v })} />
            <IconButton onClick={() => removeEstimatedPayment('State', i)} color="error" size="small"><DeleteIcon /></IconButton>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={() => addEstimatedPayment('State')} variant="outlined" size="small">
          Add State Payment
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}
