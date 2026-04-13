import {
  Container, AppBar, Toolbar, Typography, Button, Box, Stack, Grid,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaQuery from '@mui/material/useMediaQuery';
import IconButton from '@mui/material/IconButton';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useMemo, useState } from 'react';
import { useTaxStore } from './store/taxStore';
import { generateFilledPdfs } from './computation/pdf_filler';
import W2Section from './components/W2Section';
import Section1099 from './components/Section1099';
import Section1098 from './components/Section1098';
import EstimatedTaxSection from './components/EstimatedTaxSection';
import CharitableSection from './components/CharitableSection';
import OtherSection from './components/OtherSection';
import CarryoverSection from './components/CarryoverSection';
import SummaryPanel from './components/SummaryPanel';
import MarginalRatesPanel from './components/MarginalRatesPanel';

function App() {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkMode, setDarkMode] = useState<boolean | null>(null);
  const isDark = darkMode ?? prefersDark;

  const theme = useMemo(() => createTheme({
    palette: { mode: isDark ? 'dark' : 'light' },
  }), [isDark]);

  const { compute, importData, exportData, reset, fullResult, marginalRates } = useTaxStore();

  const handleExportJSON = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tax-input-2025.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDataJSON = () => {
    if (!fullResult) return;
    const blob = new Blob([JSON.stringify(fullResult.formsState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSummaryJSON = () => {
    if (!fullResult) return;
    const blob = new Blob([JSON.stringify(fullResult.summaryInfo, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'summary.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportWorksheetJSON = () => {
    if (!fullResult) return;
    const blob = new Blob([JSON.stringify(fullResult.worksheets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'worksheet.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCarryoverJSON = () => {
    if (!fullResult) return;
    const blob = new Blob([JSON.stringify(fullResult.carryover, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'carryover.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarginalRatesJSON = () => {
    if (!marginalRates) return;
    const blob = new Blob([JSON.stringify(marginalRates, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marginal_rates.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    if (!fullResult) return;
    try {
      const pdfBytes = await generateFilledPdfs(fullResult);
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'forms-2025.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF generation error:', e);
      alert('PDF error: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleImportJSON = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      importData(JSON.parse(text));
    };
    fileInput.click();
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Do My Taxes - 2025 (Single Filer)
          </Typography>
          <IconButton color="inherit" onClick={() => setDarkMode(!isDark)} sx={{ mr: 1 }}>
            {isDark ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
          <Button color="inherit" href="https://github.com/FrenchCommando/do-my-taxes" target="_blank" sx={{ mr: 1 }}>
            GitHub
          </Button>
          <Stack direction="row" spacing={1}>
            <Button color="inherit" onClick={handleImportJSON}>Import</Button>
            <Button color="inherit" onClick={handleExportJSON}>Export</Button>
            <Button color="inherit" onClick={reset}>Reset</Button>
          </Stack>
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Accordion sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2"><strong>How to use</strong></Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" component="div">
              1. Fill in your tax info in the sections below (W-2, 1099, etc.). Use <strong>+</strong> to add entries, trash icon to remove.
              <br />2. Click <strong>Compute Taxes</strong> to run the computation and see your summary.
              <br />3. Download your filled <strong>PDF forms</strong> or <strong>JSON</strong> output.
              <br />
              <br /><strong>Import</strong>/<strong>Export</strong> (top bar) — save or load your input data as JSON.
              <br /><strong>Reset</strong> — restores the sample data.
              <br />All data stays in your browser — nothing is sent to any server.
              <br />To fully clear saved data: open DevTools (F12) &gt; Application &gt; Local Storage &gt; delete <code>tax-input-storage</code>, then reload.
              <br /><br /><strong>How to file:</strong>
              <br />Federal — e-file for free at <a href="https://www.freefilefillableforms.com/home/default.php" target="_blank" rel="noopener">Free File Fillable Forms</a> (IRS). Upload or manually enter values from the downloaded PDF.
              <br />NY State — use the enhanced fill-in forms from the NY Tax Department. Print, sign, and mail.
              <br /><br />Found a bug or have a feature request? <a href="https://github.com/FrenchCommando/do-my-taxes/issues" target="_blank" rel="noopener">Open an issue on GitHub</a>.
            </Typography>
          </AccordionDetails>
        </Accordion>
        <Typography variant="body2" color="error" sx={{ mb: 2 }}>
          <strong>Disclaimer:</strong> This tool is not tax advice. Results may contain errors. Consult a qualified tax professional before filing.
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Stack spacing={1}>
              <W2Section />
              <Section1099 />
              <Section1098 />
              <EstimatedTaxSection />
              <CharitableSection />
              <OtherSection />
              <CarryoverSection />
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <Box sx={{ position: { lg: 'sticky' }, top: { lg: 16 } }}>
              <Button variant="contained" size="large" onClick={compute} fullWidth sx={{ mb: 2 }}>
                Compute Taxes
              </Button>
              <SummaryPanel />
              <MarginalRatesPanel />
              {fullResult && (
                <Stack spacing={1} sx={{ mt: 2 }}>
                  <Button variant="contained" color="secondary" onClick={handleDownloadPdf}>
                    Download PDF Forms
                  </Button>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    <Button variant="outlined" size="small" onClick={handleExportDataJSON}>data.json</Button>
                    <Button variant="outlined" size="small" onClick={handleExportSummaryJSON}>summary.json</Button>
                    <Button variant="outlined" size="small" onClick={handleExportWorksheetJSON}>worksheet.json</Button>
                    <Button variant="outlined" size="small" onClick={handleExportCarryoverJSON}>carryover.json</Button>
                    <Button variant="outlined" size="small" onClick={handleExportMarginalRatesJSON}>marginal_rates.json</Button>
                  </Stack>
                </Stack>
              )}
            </Box>
          </Grid>
        </Grid>
      </Container>
    </ThemeProvider>
  );
}

export default App;
