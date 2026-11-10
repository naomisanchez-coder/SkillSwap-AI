import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Modal compartido: el diálogo nativo vuelve inerte el fondo. */
export function Modal({ labelledBy, onClose, children }: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 m-0 h-full w-full max-h-none max-w-none overflow-hidden border-0 bg-transparent p-4 text-inherit backdrop:bg-[#17312D]/60 open:flex items-center justify-center"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const dialog = event.currentTarget;
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, summary, [tabindex]',
        )).filter(element => element.tabIndex >= 0
          && !element.matches(':disabled') && !element.closest('[inert]')
          && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      {children}
    </dialog>
  );
}
