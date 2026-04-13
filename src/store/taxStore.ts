import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  TaxInput,
  W2Entry,
  Entry1099,
  Entry1098,
  CharitableContribution,
  OtherEntry,
  EstimatedPayment,
  MortgagePayment,
  Trade,
} from '../types/input';
import {
  createDefaultInput,
  createEmptyW2,
  createEmpty1099,
  createEmpty1098,
  createEmptyCharitable,
  createEmptyOther,
} from '../types/input';
import type { TaxSummary } from '../types/output';
import type { FillTaxesResult } from '../computation/fill_taxes';
import type { MarginalRatesResult } from '../computation/marginal_rates';
import { computeTaxes, computeAllWithRates } from '../computation/compute';

interface TaxStore {
  input: TaxInput;
  summary: TaxSummary | null;
  fullResult: FillTaxesResult | null;
  marginalRates: MarginalRatesResult | null;

  setField: <K extends keyof TaxInput>(key: K, value: TaxInput[K]) => void;

  // W2
  addW2: () => void;
  updateW2: (id: string, data: Partial<W2Entry>) => void;
  removeW2: (id: string) => void;

  // 1099
  add1099: () => void;
  update1099: (id: string, data: Partial<Entry1099>) => void;
  remove1099: (id: string) => void;

  // 1099 trades
  addTrade: (entryId: string) => void;
  updateTrade: (entryId: string, index: number, data: Partial<Trade>) => void;
  removeTrade: (entryId: string, index: number) => void;

  // 1098
  add1098: () => void;
  update1098: (id: string, data: Partial<Entry1098>) => void;
  remove1098: (id: string) => void;
  addMortgagePayment: (entryId: string) => void;
  updateMortgagePayment: (entryId: string, index: number, data: Partial<MortgagePayment>) => void;
  removeMortgagePayment: (entryId: string, index: number) => void;

  // Estimated tax
  addEstimatedPayment: (type: 'Federal' | 'State') => void;
  updateEstimatedPayment: (type: 'Federal' | 'State', index: number, data: Partial<EstimatedPayment>) => void;
  removeEstimatedPayment: (type: 'Federal' | 'State', index: number) => void;

  // Charitable
  addCharitable: () => void;
  updateCharitable: (id: string, data: Partial<CharitableContribution>) => void;
  removeCharitable: (id: string) => void;

  // Other
  addOther: () => void;
  updateOther: (id: string, data: Partial<OtherEntry>) => void;
  removeOther: (id: string) => void;

  // Actions
  compute: () => void;
  importData: (data: TaxInput) => void;
  exportData: () => TaxInput;
  reset: () => void;
}

export const useTaxStore = create<TaxStore>()(
  persist(
    (set, get) => ({
      input: createDefaultInput(),
      summary: null,
      fullResult: null,
      marginalRates: null,

      setField: (key, value) =>
        set((s) => ({ input: { ...s.input, [key]: value } })),

      addW2: () =>
        set((s) => ({ input: { ...s.input, W2: [...s.input.W2, createEmptyW2()] } })),
      updateW2: (id, data) =>
        set((s) => ({
          input: { ...s.input, W2: s.input.W2.map((w) => (w.id === id ? { ...w, ...data } : w)) },
        })),
      removeW2: (id) =>
        set((s) => ({ input: { ...s.input, W2: s.input.W2.filter((w) => w.id !== id) } })),

      add1099: () =>
        set((s) => ({ input: { ...s.input, '1099': [...s.input['1099'], createEmpty1099()] } })),
      update1099: (id, data) =>
        set((s) => ({
          input: { ...s.input, '1099': s.input['1099'].map((e) => (e.id === id ? { ...e, ...data } : e)) },
        })),
      remove1099: (id) =>
        set((s) => ({ input: { ...s.input, '1099': s.input['1099'].filter((e) => e.id !== id) } })),

      addTrade: (entryId) =>
        set((s) => ({
          input: {
            ...s.input,
            '1099': s.input['1099'].map((e) =>
              e.id === entryId
                ? { ...e, Trades: [...e.Trades, { SalesDescription: '', Shares: '', DateAcquired: '', DateSold: '', WashSaleCode: '', Proceeds: 0, Cost: 0, WashSaleValue: 0, LongShort: 'SHORT' as const, FormCode: 'A' as const }] }
                : e
            ),
          },
        })),
      updateTrade: (entryId, index, data) =>
        set((s) => ({
          input: {
            ...s.input,
            '1099': s.input['1099'].map((e) =>
              e.id === entryId
                ? { ...e, Trades: e.Trades.map((t, i) => (i === index ? { ...t, ...data } : t)) }
                : e
            ),
          },
        })),
      removeTrade: (entryId, index) =>
        set((s) => ({
          input: {
            ...s.input,
            '1099': s.input['1099'].map((e) =>
              e.id === entryId
                ? { ...e, Trades: e.Trades.filter((_, i) => i !== index) }
                : e
            ),
          },
        })),

      add1098: () =>
        set((s) => ({ input: { ...s.input, '1098': [...s.input['1098'], createEmpty1098()] } })),
      update1098: (id, data) =>
        set((s) => ({
          input: { ...s.input, '1098': s.input['1098'].map((e) => (e.id === id ? { ...e, ...data } : e)) },
        })),
      remove1098: (id) =>
        set((s) => ({ input: { ...s.input, '1098': s.input['1098'].filter((e) => e.id !== id) } })),

      addMortgagePayment: (entryId) =>
        set((s) => ({
          input: {
            ...s.input,
            '1098': s.input['1098'].map((e) =>
              e.id === entryId
                ? { ...e, Payments: [...e.Payments, { Date: '', InterestAmount: 0, PrincipalAmount: 0 }] }
                : e
            ),
          },
        })),
      updateMortgagePayment: (entryId, index, data) =>
        set((s) => ({
          input: {
            ...s.input,
            '1098': s.input['1098'].map((e) =>
              e.id === entryId
                ? { ...e, Payments: e.Payments.map((p, i) => (i === index ? { ...p, ...data } : p)) }
                : e
            ),
          },
        })),
      removeMortgagePayment: (entryId, index) =>
        set((s) => ({
          input: {
            ...s.input,
            '1098': s.input['1098'].map((e) =>
              e.id === entryId
                ? { ...e, Payments: e.Payments.filter((_, i) => i !== index) }
                : e
            ),
          },
        })),

      addEstimatedPayment: (type) =>
        set((s) => ({
          input: {
            ...s.input,
            EstimatedIncomeTax: {
              ...s.input.EstimatedIncomeTax,
              [type]: [...s.input.EstimatedIncomeTax[type], { Date: '', Amount: 0 }],
            },
          },
        })),
      updateEstimatedPayment: (type, index, data) =>
        set((s) => ({
          input: {
            ...s.input,
            EstimatedIncomeTax: {
              ...s.input.EstimatedIncomeTax,
              [type]: s.input.EstimatedIncomeTax[type].map((p, i) =>
                i === index ? { ...p, ...data } : p
              ),
            },
          },
        })),
      removeEstimatedPayment: (type, index) =>
        set((s) => ({
          input: {
            ...s.input,
            EstimatedIncomeTax: {
              ...s.input.EstimatedIncomeTax,
              [type]: s.input.EstimatedIncomeTax[type].filter((_, i) => i !== index),
            },
          },
        })),

      addCharitable: () =>
        set((s) => ({
          input: { ...s.input, Charitable: [...s.input.Charitable, createEmptyCharitable()] },
        })),
      updateCharitable: (id, data) =>
        set((s) => ({
          input: { ...s.input, Charitable: s.input.Charitable.map((c) => (c.id === id ? { ...c, ...data } : c)) },
        })),
      removeCharitable: (id) =>
        set((s) => ({
          input: { ...s.input, Charitable: s.input.Charitable.filter((c) => c.id !== id) },
        })),

      addOther: () =>
        set((s) => ({
          input: { ...s.input, Other: [...s.input.Other, createEmptyOther()] },
        })),
      updateOther: (id, data) =>
        set((s) => ({
          input: { ...s.input, Other: s.input.Other.map((o) => (o.id === id ? { ...o, ...data } : o)) },
        })),
      removeOther: (id) =>
        set((s) => ({
          input: { ...s.input, Other: s.input.Other.filter((o) => o.id !== id) },
        })),

      compute: () => {
        try {
          const { result: fullResult, marginalRates } = computeAllWithRates(get().input);
          const summary = computeTaxes(get().input);
          set({ summary, fullResult, marginalRates });
        } catch (e) {
          console.error('Tax computation error:', e);
          alert('Computation error: ' + (e instanceof Error ? e.message : String(e)));
        }
      },

      importData: (data) => set({ input: data, summary: null, fullResult: null, marginalRates: null }),
      exportData: () => get().input,
      reset: () => set({ input: createDefaultInput(), summary: null, fullResult: null, marginalRates: null }),
    }),
    {
      name: 'tax-input-storage',
      version: 2,
      migrate: () => ({
        input: createDefaultInput(),
        summary: null,
        fullResult: null,
      }),
    }
  )
);
