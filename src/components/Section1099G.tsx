import {
  Accordion, AccordionSummary, AccordionDetails,
  Typography, Button, TextField, IconButton, Box,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useTaxStore } from '../store/taxStore';
import NumberField from './NumberField';
import type { W2Owner } from '../types/input';

export default function Section1099G() {
  const { '1099G': entries, filing_status: filingStatus } = useTaxStore((s) => s.input);
  const marriedFilingJointly = filingStatus === 'married_filing_jointly';
  const { add1099G, update1099G, remove1099G } = useTaxStore();

  return (
    <Accordion defaultExpanded={entries.length > 0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" sx={{ opacity: entries.length > 0 ? 1 : 0.5 }}>
          1099-G Unemployment ({entries.length})
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {entries.map((entry) => (
          <Box key={entry.id} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1, alignItems: 'center', opacity: !marriedFilingJointly && entry.Owner === 'spouse' ? 0.5 : 1 }}>
            <TextField label="Payer" size="small" value={entry.Payer} onChange={(e) => update1099G(entry.id, { Payer: e.target.value })} sx={{ flex: 1, minWidth: 160 }} />
            {(marriedFilingJointly || entry.Owner === 'spouse') && (
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>Owner</InputLabel>
                <Select value={entry.Owner} label="Owner" onChange={(e) => update1099G(entry.id, { Owner: e.target.value as W2Owner })}>
                  <MenuItem value="self">You</MenuItem>
                  <MenuItem value="spouse">Spouse</MenuItem>
                </Select>
              </FormControl>
            )}
            <NumberField label="Box 1 Unemployment" value={entry.Unemployment} onChange={(v) => update1099G(entry.id, { Unemployment: v })} />
            <NumberField label="Box 4 Federal tax withheld" value={entry.Federal_tax} onChange={(v) => update1099G(entry.id, { Federal_tax: v })} />
            <NumberField label="Box 11 State tax withheld" value={entry.State_tax} onChange={(v) => update1099G(entry.id, { State_tax: v })} />
            <IconButton onClick={() => remove1099G(entry.id)} color="error" size="small"><DeleteIcon /></IconButton>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={add1099G} variant="outlined" size="small">
          Add 1099-G
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}
