import {
  Accordion, AccordionSummary, AccordionDetails,
  Typography, Button, TextField, IconButton, Box, FormControlLabel, Checkbox,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useTaxStore } from '../store/taxStore';
import NumberField from './NumberField';

export default function CharitableSection() {
  const { Charitable } = useTaxStore((s) => s.input);
  const { addCharitable, updateCharitable, removeCharitable } = useTaxStore();

  return (
    <Accordion defaultExpanded={Charitable.length > 0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" sx={{ opacity: Charitable.length > 0 ? 1 : 0.5 }}>
          Charitable Contributions ({Charitable.length})
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {Charitable.map((c) => (
          <Box key={c.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField label="Entity" size="small" value={c.Entity} onChange={(e) => updateCharitable(c.id, { Entity: e.target.value })} sx={{ flex: 1 }} />
            <NumberField label="Amount" value={c.Amount} onChange={(v) => updateCharitable(c.id, { Amount: v })} />
            <FormControlLabel
              control={<Checkbox size="small" checked={c.DonorAdvisedFund} onChange={(e) => updateCharitable(c.id, { DonorAdvisedFund: e.target.checked })} />}
              label={<Typography variant="body2">Donor-advised fund</Typography>}
              title="2026+: gifts to donor-advised funds don't count for the non-itemizer deduction"
            />
            <IconButton onClick={() => removeCharitable(c.id)} color="error" size="small"><DeleteIcon /></IconButton>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={addCharitable} variant="outlined" size="small">
          Add Contribution
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}
