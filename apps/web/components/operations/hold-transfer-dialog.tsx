"use client";

import { useEffect, useId, useRef, useState } from "react";
import { validateOperationalReason } from "../../lib/portal";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

interface HoldTransferDialogProps {
  open: boolean;
  reference: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function HoldTransferDialog({
  open,
  reference,
  onCancel,
  onConfirm
}: HoldTransferDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  return (
    <Dialog
      className="reason-dialog"
      description={`This pauses work on ${reference} until it is released.`}
      initialFocusRef={inputRef}
      onClose={onCancel}
      open={open}
      title="Place transfer on hold"
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const validationError = validateOperationalReason(reason);
          setError(validationError);
          if (validationError) {
            inputRef.current?.focus();
            return;
          }
          onConfirm(reason.trim());
        }}
      >
        <label htmlFor="hold-reason">Reason</label>
        <textarea
          aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
          aria-invalid={Boolean(error)}
          id="hold-reason"
          maxLength={240}
          onChange={(event) => {
            setReason(event.target.value);
            if (error) setError(validateOperationalReason(event.target.value));
          }}
          placeholder="Add a concise operational reason"
          ref={inputRef}
          required
          rows={4}
          value={reason}
        />
        <p className="field-hint" id={hintId}>Required · 240 characters maximum</p>
        {error ? <p className="field-error" id={errorId}>{error}</p> : null}
        <div className="dialog-actions">
          <Button onClick={onCancel} variant="outline">Cancel</Button>
          <Button variant="danger" type="submit">Place on hold</Button>
        </div>
      </form>
    </Dialog>
  );
}
