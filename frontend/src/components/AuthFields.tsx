import type { ReactNode } from 'react';
import { Icons } from './icons';

export function AuthField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  error,
  helper,
  icon,
  disabled,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  helper?: string;
  icon?: ReactNode;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-[#263D39]">{label}</label>
      <div className="relative mt-2">
        {icon && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#788983]">{icon}</span>}
        <input
          id={id}
          type={type}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined}
          disabled={disabled}
          maxLength={maxLength}
          className={`w-full h-12 rounded-xl border bg-white px-3 text-sm text-[#182B2A] placeholder:text-[#8A9994] focus:outline-none focus:ring-2 focus:ring-[#B9D2C4] disabled:bg-[#F7F7F2] disabled:text-[#52645F] ${icon ? 'pl-11' : ''} ${error ? 'border-[#B54747]' : 'border-[#C9D4CC] focus:border-[#24685F]'}`}
        />
      </div>
      {error ? <FieldError id={`${id}-error`} message={error} /> : helper && <p id={`${id}-helper`} className="mt-2 text-xs text-[#60716C]">{helper}</p>}
    </div>
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  error,
  children,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-[#263D39]">{label}</label>
      <select
        id={id}
        disabled={disabled}
        value={value}
        onChange={event => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-2 w-full h-12 rounded-xl border bg-white px-3 text-sm text-[#182B2A] focus:outline-none focus:ring-2 focus:ring-[#B9D2C4] ${error ? 'border-[#B54747]' : 'border-[#C9D4CC] focus:border-[#24685F]'}`}
      >
        {children}
      </select>
      {error && <FieldError id={`${id}-error`} message={error} />}
    </div>
  );
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
  error,
  autoComplete,
  maxLength = 128,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  error?: string;
  autoComplete: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-[#263D39]">{label}</label>
      <div className="relative mt-2">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#788983]"><Icons.Lock s={17} /></span>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={event => onChange(event.target.value)}
          autoComplete={autoComplete}
          maxLength={maxLength}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full h-12 rounded-xl border bg-white pl-11 pr-12 text-sm text-[#182B2A] focus:outline-none focus:ring-2 focus:ring-[#B9D2C4] ${error ? 'border-[#B54747]' : 'border-[#C9D4CC] focus:border-[#24685F]'}`}
        />
        <button type="button" onClick={onToggle} aria-label={`${show ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={show} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg flex items-center justify-center text-[#60716C] hover:bg-[#F7F7F2]">
          {show ? <Icons.EyeOff s={17} /> : <Icons.Eye s={17} />}
        </button>
      </div>
      {error && <FieldError id={`${id}-error`} message={error} />}
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message: string }) {
  return <p id={id} role="alert" className="mt-2 text-xs font-semibold text-[#B54747] flex items-center gap-1.5"><Icons.Alert s={13} /> {message}</p>;
}
