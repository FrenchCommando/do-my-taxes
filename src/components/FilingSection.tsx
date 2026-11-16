import {
  Accordion, AccordionSummary, AccordionDetails,
  Typography, TextField, Grid, FormControl, InputLabel, Select, MenuItem, Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTaxStore } from '../store/taxStore';
import { FILING_STATUS_LABELS, PROVISIONAL_YEARS, TAX_YEARS } from '../computation/config';
import type { FilingStatus, TaxYear } from '../computation/config';

export default function FilingSection() {
  const { year, filing_status: filingStatus, birth_date: birthDate, spouse } = useTaxStore((s) => s.input);
  const { setField, updateSpouse } = useTaxStore();
  const marriedFilingJointly = filingStatus === 'married_filing_jointly';

  return (
    <Accordion defaultExpanded>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6">
          Filing: {year}, {FILING_STATUS_LABELS[filingStatus]}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Grid container spacing={1}>
          <Grid size={{ xs: 6, sm: 4 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Tax year</InputLabel>
              <Select value={year} label="Tax year" onChange={(e) => setField('year', e.target.value as TaxYear)}>
                {TAX_YEARS.map((each) => (
                  <MenuItem key={each} value={each}>
                    {each}{PROVISIONAL_YEARS.includes(each) ? ' (provisional)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Filing status</InputLabel>
              <Select value={filingStatus} label="Filing status" onChange={(e) => setField('filing_status', e.target.value as FilingStatus)}>
                {Object.entries(FILING_STATUS_LABELS).map(([value, text]) => (
                  <MenuItem key={value} value={value}>{text}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Your birth date" type="date" size="small" fullWidth value={birthDate}
              onChange={(e) => setField('birth_date', e.target.value)}
              helperText="Optional, for the senior deduction (65+)"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
        </Grid>
        {PROVISIONAL_YEARS.includes(year) && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {year} is provisional: the federal numbers are final (Rev. Proc. 2025-32), but the IRS forms are not
            published yet, so there is no PDF download. NY / NYC use the 2025 tax tables as placeholders and will
            overstate NY tax in the lower brackets.
          </Alert>
        )}
        {marriedFilingJointly && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              Spouse (your own name and SSN come from your W-2s; mark your spouse's W-2s as "Spouse")
            </Typography>
            <Grid container spacing={1} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField label="First name" size="small" fullWidth value={spouse.first_name} onChange={(e) => updateSpouse({ first_name: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 2, sm: 1 }}>
                <TextField label="MI" size="small" fullWidth value={spouse.initial} onChange={(e) => updateSpouse({ initial: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 4, sm: 3 }}>
                <TextField label="Last name" size="small" fullWidth value={spouse.last_name} onChange={(e) => updateSpouse({ last_name: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField label="SSN" size="small" fullWidth value={spouse.ssn} onChange={(e) => updateSpouse({ ssn: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField label="Occupation" size="small" fullWidth value={spouse.occupation} onChange={(e) => updateSpouse({ occupation: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField
                  label="Birth date" type="date" size="small" fullWidth value={spouse.birth_date}
                  onChange={(e) => updateSpouse({ birth_date: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>
            </Grid>
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
