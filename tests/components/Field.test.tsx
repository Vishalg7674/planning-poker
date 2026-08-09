import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field, Input, Select, Textarea } from '@/components/Field';

describe('Field', () => {
  it('renders a label bound to the input via htmlFor', () => {
    render(
      <Field label="Your Name" htmlFor="name">
        <Input id="name" />
      </Field>,
    );
    expect(screen.getByLabelText('Your Name')).toBeInTheDocument();
  });

  it('renders an error with role alert', () => {
    render(
      <Field label="Name" error="Too short">
        <Input id="name" />
      </Field>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Too short');
  });

  it('renders a hint when there is no error', () => {
    render(
      <Field label="Name" hint="At least 2 characters">
        <Input id="name" />
      </Field>,
    );
    expect(screen.getByText('At least 2 characters')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('input controls', () => {
  it('Input forwards props', () => {
    render(<Input id="x" placeholder="hi" maxLength={5} />);
    const el = screen.getByPlaceholderText('hi');
    expect(el).toHaveAttribute('maxlength', '5');
  });

  it('Textarea renders a textarea', () => {
    render(<Textarea aria-label="notes" />);
    expect(screen.getByLabelText('notes').tagName).toBe('TEXTAREA');
  });

  it('Select renders a select', () => {
    render(
      <Select aria-label="deck">
        <option>fibonacci</option>
      </Select>,
    );
    expect(screen.getByLabelText('deck').tagName).toBe('SELECT');
  });
});
