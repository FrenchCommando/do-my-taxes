import { TextField } from '@mui/material';
import type { TextFieldProps } from '@mui/material';

type NumberFieldProps = Omit<TextFieldProps, 'onChange'> & {
  value: number;
  onChange: (value: number) => void;
};

export default function NumberField({ value, onChange, ...props }: NumberFieldProps) {
  return (
    <TextField
      type="number"
      size="small"
      value={value || ''}
      placeholder="0"
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      slotProps={{
        inputLabel: { shrink: true },
        input: {
          sx: {
            '& input::placeholder': { color: 'text.disabled', opacity: 1 },
          },
        },
      }}
      {...props}
    />
  );
}
