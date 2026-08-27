"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icon";

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  initialFocusRef,
  className = ""
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-title`;
  const descriptionId = `${titleId}-description`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => initialFocusRef?.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [initialFocusRef, open]);

  return (
    <dialog
      aria-modal="true"
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={`dialog ${className}`.trim()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
      role="dialog"
    >
      <div className="dialog-heading">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>
        <button aria-label={`Close ${title}`} className="icon-button" onClick={onClose} type="button">
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
