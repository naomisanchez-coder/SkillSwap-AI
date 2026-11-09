import type { ButtonHTMLAttributes } from 'react';

// Variantes del Button original de Figma; admite atributos nativos y ARIA.
const variants = {
  primary: 'bg-[#24685F] text-white hover:bg-[#1D5149] active:bg-[#174D46] shadow-sm',
  secondary: 'bg-[#DCEBDD] text-[#1D5149] hover:bg-[#CDE3D1]',
  outline: 'border border-[#CBD8CE] text-[#334A46] bg-white hover:border-[#34877A] hover:text-[#24685F]',
  ghost: 'text-[#60716C] hover:bg-[#F0F3ED] hover:text-[#182B2A]',
};

export function Button({ variant = 'primary', className = '', type = 'button', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button type={type} {...props} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`} />;
}
