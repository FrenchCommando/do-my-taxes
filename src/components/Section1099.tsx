import {
  Accordion, AccordionSummary, AccordionDetails,
  Typography, Button, TextField, Grid, IconButton, Box,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useTaxStore } from '../store/taxStore';
import NumberField from './NumberField';
import type { Trade } from '../types/input';

export default function Section1099() {
  const entries = useTaxStore((s) => s.input['1099']);
  const { add1099, update1099, remove1099, addTrade, updateTrade, removeTrade } = useTaxStore();

  return (
    <Accordion defaultExpanded={entries.length > 0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" sx={{ opacity: entries.length > 0 ? 1 : 0.5 }}>
          1099 Income ({entries.length})
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {entries.map((entry) => (
          <Box key={entry.id} sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <TextField label="Institution" size="small" value={entry.Institution} onChange={(e) => update1099(entry.id, { Institution: e.target.value })} sx={{ flex: 1, mr: 1 }} />
              <IconButton onClick={() => remove1099(entry.id)} color="error" size="small"><DeleteIcon /></IconButton>
            </Box>
            <Grid container spacing={1}>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Interest" value={entry.Interest} onChange={(v) => update1099(entry.id, { Interest: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="US Govt Bond Interest" value={entry.InterestBondsObligations} onChange={(v) => update1099(entry.id, { InterestBondsObligations: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Ordinary Dividends" value={entry['Ordinary Dividends']} onChange={(v) => update1099(entry.id, { 'Ordinary Dividends': v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Qualified Dividends" value={entry['Qualified Dividends']} onChange={(v) => update1099(entry.id, { 'Qualified Dividends': v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Capital Gain Distributions" value={entry['Capital Gain Distributions']} onChange={(v) => update1099(entry.id, { 'Capital Gain Distributions': v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Foreign Tax Paid" value={entry['Foreign Tax Paid']} onChange={(v) => update1099(entry.id, { 'Foreign Tax Paid': v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <TextField label="Foreign Country" size="small" value={entry['Foreign Country']} onChange={(e) => update1099(entry.id, { 'Foreign Country': e.target.value })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Realized 1256" value={entry.Realized1256} onChange={(v) => update1099(entry.id, { Realized1256: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Unrealized 1256" value={entry.Unrealized1256} onChange={(v) => update1099(entry.id, { Unrealized1256: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Other Income" value={entry['Other Income']} onChange={(v) => update1099(entry.id, { 'Other Income': v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <TextField label="Other Description" size="small" value={entry['Other Description']} onChange={(e) => update1099(entry.id, { 'Other Description': e.target.value })} fullWidth />
              </Grid>
            </Grid>

            {/* Trades sub-section */}
            <Box sx={{ mt: 2, pl: 1, borderLeft: '3px solid #1976d2' }}>
              <Typography variant="subtitle2" sx={{ mb: 1, opacity: entry.Trades.length > 0 ? 1 : 0.5 }}>
                Trades ({entry.Trades.length})
              </Typography>
              {entry.Trades.map((trade, ti) => (
                <Box key={ti} sx={{ mb: 1.5, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField label="Description" size="small" value={trade.SalesDescription} onChange={(e) => updateTrade(entry.id, ti, { SalesDescription: e.target.value })} sx={{ flex: 1, minWidth: 150 }} />
                    <TextField label="Shares" size="small" value={trade.Shares} onChange={(e) => updateTrade(entry.id, ti, { Shares: e.target.value })} sx={{ width: 100 }} />
                    <FormControl size="small" sx={{ minWidth: 90 }}>
                      <InputLabel>Term</InputLabel>
                      <Select value={trade.LongShort} label="Term" onChange={(e) => updateTrade(entry.id, ti, { LongShort: e.target.value as Trade['LongShort'] })}>
                        <MenuItem value="SHORT">Short</MenuItem>
                        <MenuItem value="LONG">Long</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 70 }}>
                      <InputLabel>Box</InputLabel>
                      <Select value={trade.FormCode} label="Box" onChange={(e) => updateTrade(entry.id, ti, { FormCode: e.target.value as Trade['FormCode'] })}>
                        {['A', 'B', 'C', 'D', 'E', 'F'].map((c) => (
                          <MenuItem key={c} value={c}>{c}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <IconButton onClick={() => removeTrade(entry.id, ti)} color="error" size="small"><DeleteIcon /></IconButton>
                  </Box>
                  <Grid container spacing={1}>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <TextField label="Date Acquired" size="small" value={trade.DateAcquired} onChange={(e) => updateTrade(entry.id, ti, { DateAcquired: e.target.value })} fullWidth />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <TextField label="Date Sold" size="small" value={trade.DateSold} onChange={(e) => updateTrade(entry.id, ti, { DateSold: e.target.value })} fullWidth />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 2 }}>
                      <NumberField label="Proceeds" value={trade.Proceeds} onChange={(v) => updateTrade(entry.id, ti, { Proceeds: v })} fullWidth />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 2 }}>
                      <NumberField label="Cost" value={trade.Cost} onChange={(v) => updateTrade(entry.id, ti, { Cost: v })} fullWidth />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 2 }}>
                      <NumberField label="Wash Sale" value={trade.WashSaleValue} onChange={(v) => updateTrade(entry.id, ti, { WashSaleValue: v })} fullWidth />
                    </Grid>
                  </Grid>
                </Box>
              ))}
              <Button startIcon={<AddIcon />} onClick={() => addTrade(entry.id)} variant="text" size="small">
                Add Trade
              </Button>
            </Box>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={add1099} variant="outlined" size="small">
          Add 1099
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}
