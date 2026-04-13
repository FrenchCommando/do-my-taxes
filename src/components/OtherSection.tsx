import {
  Accordion, AccordionSummary, AccordionDetails,
  Typography, Button, IconButton, Box, Grid,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useTaxStore } from '../store/taxStore';
import NumberField from './NumberField';

export default function OtherSection() {
  const { Other } = useTaxStore((s) => s.input);
  const { addOther, updateOther, removeOther } = useTaxStore();

  return (
    <Accordion defaultExpanded={Other.length > 0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6" sx={{ opacity: Other.length > 0 ? 1 : 0.5 }}>
          Other ({Other.length})
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {Other.map((o) => (
          <Box key={o.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <Grid container spacing={1} sx={{ flex: 1 }}>
              <Grid size={{ xs: 4 }}>
                <NumberField label="Property Tax" value={o.PropertyTax} onChange={(v) => updateOther(o.id, { PropertyTax: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <NumberField label="Co-op State Taxes" value={o.CoopStateTaxes} onChange={(v) => updateOther(o.id, { CoopStateTaxes: v })} fullWidth />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <NumberField label="Days in NYC" value={o.DaysInNYC} onChange={(v) => updateOther(o.id, { DaysInNYC: v })} fullWidth />
              </Grid>
            </Grid>
            <IconButton onClick={() => removeOther(o.id)} color="error" size="small"><DeleteIcon /></IconButton>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={addOther} variant="outlined" size="small">
          Add Entry
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}
