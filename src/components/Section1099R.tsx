import {
  Accordion, AccordionSummary, AccordionDetails,
  Typography, Button, TextField, IconButton, Box, FormControlLabel, Checkbox,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useTaxStore } from '../store/taxStore';
import NumberField from './NumberField';
import type { W2Owner } from '../types/input';

export default function Section1099R() {
  const { '1099R': entries, filing_status: filingStatus } = useTaxStore((s) => s.input);
  const marriedFilingJointly = filingStatus === 'married_filing_jointly';
  const { add1099R, update1099R, remove1099R } = useTaxStore();

  return (
    <Accordion defaultExpanded={entries.length > 0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" sx={{ opacity: entries.length > 0 ? 1 : 0.5 }}>
          1099-R Retirement Distributions ({entries.length})
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" sx={{ mb: 1, opacity: 0.7 }}>
          401(k) distributions and in-plan Roth conversions go on Form 1040 lines 5a/5b, IRA distributions on 4a/4b.
          Box 2a is used as reported (Form 8606 is not computed).
        </Typography>
        {entries.map((entry) => (
          <Box key={entry.id} sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1, opacity: !marriedFilingJointly && entry.Owner === 'spouse' ? 0.5 : 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <TextField label="Payer" size="small" value={entry.Payer} onChange={(e) => update1099R(entry.id, { Payer: e.target.value })} sx={{ flex: 1, mr: 1 }} />
              {(marriedFilingJointly || entry.Owner === 'spouse') && (
                <FormControl size="small" sx={{ minWidth: 110, mr: 1 }}>
                  <InputLabel>Owner</InputLabel>
                  <Select value={entry.Owner} label="Owner" onChange={(e) => update1099R(entry.id, { Owner: e.target.value as W2Owner })}>
                    <MenuItem value="self">You</MenuItem>
                    <MenuItem value="spouse">Spouse</MenuItem>
                  </Select>
                </FormControl>
              )}
              <IconButton onClick={() => remove1099R(entry.id)} color="error" size="small"><DeleteIcon /></IconButton>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              <NumberField label="Box 1 Gross distribution" value={entry.GrossDistribution} onChange={(v) => update1099R(entry.id, { GrossDistribution: v })} />
              <NumberField label="Box 2a Taxable amount" value={entry.TaxableAmount} onChange={(v) => update1099R(entry.id, { TaxableAmount: v })} />
              <NumberField label="Box 4 Federal tax withheld" value={entry.Federal_tax} onChange={(v) => update1099R(entry.id, { Federal_tax: v })} />
              <NumberField label="Box 14 State tax withheld" value={entry.State_tax} onChange={(v) => update1099R(entry.id, { State_tax: v })} />
              <NumberField label="Box 17 Local tax withheld" value={entry.Local_tax} onChange={(v) => update1099R(entry.id, { Local_tax: v })} />
              <TextField
                label="Box 7 Code" size="small" value={entry.DistributionCode}
                onChange={(e) => update1099R(entry.id, { DistributionCode: e.target.value.toUpperCase() })}
                title="G: direct rollover / in-plan Roth rollover, H: Roth 401(k) to Roth IRA (both check the rollover box)"
                sx={{ width: 110 }}
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={entry.IRA} onChange={(e) => update1099R(entry.id, { IRA: e.target.checked })} />}
                label={<Typography variant="body2">IRA/SEP/SIMPLE</Typography>}
              />
            </Box>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={add1099R} variant="outlined" size="small">
          Add 1099-R
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}
