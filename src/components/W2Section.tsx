import {
  Accordion, AccordionSummary, AccordionDetails,
  Typography, Button, TextField, Grid, IconButton, Box,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useTaxStore } from '../store/taxStore';
import NumberField from './NumberField';

export default function W2Section() {
  const { W2 } = useTaxStore((s) => s.input);
  const { addW2, updateW2, removeW2 } = useTaxStore();

  return (
    <Accordion defaultExpanded={W2.length > 0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" sx={{ opacity: W2.length > 0 ? 1 : 0.5 }}>
          W-2 Wage Statements ({W2.length})
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {W2.map((entry) => (
          <Box key={entry.id} sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <TextField label="Company" size="small" value={entry.Company} onChange={(e) => updateW2(entry.id, { Company: e.target.value })} sx={{ flex: 1, mr: 1 }} />
              <IconButton onClick={() => removeW2(entry.id)} color="error" size="small"><DeleteIcon /></IconButton>
            </Box>
            <Grid container spacing={1} sx={{ mb: 1 }}>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <TextField label="First Name" size="small" value={entry.FirstName} onChange={(e) => updateW2(entry.id, { FirstName: e.target.value })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <TextField label="Last Name" size="small" value={entry.LastName} onChange={(e) => updateW2(entry.id, { LastName: e.target.value })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <TextField label="SSN" size="small" value={entry.SSN} onChange={(e) => updateW2(entry.id, { SSN: e.target.value })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <TextField label="State" size="small" value={entry.State} onChange={(e) => updateW2(entry.id, { State: e.target.value })} fullWidth />
              </Grid>
            </Grid>
            <Typography variant="caption" color="text.secondary">Income & Taxes</Typography>
            <Grid container spacing={1}>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Wages" value={entry.Wages} onChange={(v) => updateW2(entry.id, { Wages: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Federal Tax" value={entry.Federal_tax} onChange={(v) => updateW2(entry.id, { Federal_tax: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="SS Wages" value={entry.SocialSecurity_wages} onChange={(v) => updateW2(entry.id, { SocialSecurity_wages: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="SS Tax" value={entry.SocialSecurity_tax} onChange={(v) => updateW2(entry.id, { SocialSecurity_tax: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Medicare Wages" value={entry.Medicare_wages} onChange={(v) => updateW2(entry.id, { Medicare_wages: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Medicare Tax" value={entry.Medicare_tax} onChange={(v) => updateW2(entry.id, { Medicare_tax: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="State Tax" value={entry.State_tax} onChange={(v) => updateW2(entry.id, { State_tax: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 3 }}>
                <NumberField label="Local Tax" value={entry.Local_tax} onChange={(v) => updateW2(entry.id, { Local_tax: v })} fullWidth />
              </Grid>
            </Grid>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={addW2} variant="outlined" size="small">
          Add W-2
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}
