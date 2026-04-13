import {
  Container, AppBar, Toolbar, Typography, Button, Box, Stack, Grid, Paper,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useTaxStore } from './store/taxStore';
import { generateFilledPdfs } from './computation/pdf_filler';
import W2Section from './components/W2Section';
import Section1099 from './components/Section1099';
import Section1098 from './components/Section1098';
import EstimatedTaxSection from './components/EstimatedTaxSection';
import CharitableSection from './components/CharitableSection';
import OtherSection from './components/OtherSection';
import SummaryPanel from './components/SummaryPanel';

const theme = createTheme({
  palette: { mode: 'light' },
});

function App() {
  const { compute, importData, exportData, reset, fullResult } = useTaxStore();

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
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Do My Taxes - 2025 (Single Filer)</Typography>
          <Stack direction="row" spacing={1}>
            <Button color="inherit" onClick={handleImportJSON}>Import</Button>
            <Button color="inherit" onClick={handleExportJSON}>Export</Button>
            <Button color="inherit" onClick={reset}>Reset</Button>
          </Stack>
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
          <Typography variant="body2" color="text.secondary" component="div">
            <strong>How to use:</strong>
            <br />1. Fill in your tax info in the sections below (W-2, 1099, etc.). Use <strong>+</strong> to add entries, trash icon to remove.
            <br />2. Click <strong>Compute Taxes</strong> to run the computation and see your summary.
            <br />3. Download your filled <strong>PDF forms</strong> or <strong>JSON</strong> output.
            <br />
            <br /><strong>Import</strong>/<strong>Export</strong> (top bar) — save or load your input data as JSON.
            <br /><strong>Reset</strong> — restores the sample data.
            <br />All data stays in your browser — nothing is sent to any server.
            <br />To fully clear saved data: open DevTools (F12) &gt; Application &gt; Local Storage &gt; delete <code>tax-input-storage</code>, then reload.
          </Typography>
        </Paper>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Stack spacing={1}>
              <W2Section />
              <Section1099 />
              <Section1098 />
              <EstimatedTaxSection />
              <CharitableSection />
              <OtherSection />
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <Box sx={{ position: { lg: 'sticky' }, top: { lg: 16 } }}>
              <Button variant="contained" size="large" onClick={compute} fullWidth sx={{ mb: 2 }}>
                Compute Taxes
              </Button>
              <SummaryPanel />
              {fullResult && (
                <Stack spacing={1} sx={{ mt: 2 }}>
                  <Button variant="contained" color="secondary" onClick={handleDownloadPdf}>
                    Download PDF Forms
                  </Button>
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" size="small" onClick={handleExportDataJSON}>
                      data.json
                    </Button>
                    <Button variant="outlined" size="small" onClick={handleExportSummaryJSON}>
                      summary.json
                    </Button>
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
