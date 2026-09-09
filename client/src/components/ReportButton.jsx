import { useState } from 'react';
import { Flag, Check } from 'lucide-react';
import api, { errMsg } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Field, inputCls } from './ui.jsx';

const REASONS = [
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'not-food', label: 'Not about food' },
  { value: 'misleading', label: 'Misleading or fake' },
  { value: 'spam', label: 'Spam or an advert' },
  { value: 'offensive', label: 'Offensive or abusive' },
  { value: 'other', label: 'Something else' },
];

/**
 * Reports a reel or a review for moderation.
 *
 * Deliberately quiet: a small link rather than a prominent button, since
 * reporting should be available without inviting it.
 */
export default function ReportButton({ targetType, targetId, className = '', label = 'Report' }) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('inappropriate');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/reports', { targetType, targetId, reason, note });
      setSent(true);
      setOpen(false);
      toast(
        data.status === 'already-reported'
          ? 'You have already reported this — our team is on it.'
          : 'Thanks. Our team will take a look.',
        'success'
      );
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs text-stone-400 ${className}`}>
        <Check size={12} /> Reported
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (user ? setOpen(true) : toast('Sign in to report content', 'info'))}
        className={`inline-flex items-center gap-1 text-xs text-stone-400 transition hover:text-red-600 ${className}`}
      >
        <Flag size={12} /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[950] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="font-semibold text-stone-900">Report this {targetType}</h3>
            <p className="mt-1 text-sm text-stone-600">
              Tell us what is wrong and a moderator will review it.
            </p>

            <Field label="Reason">
              <select className={`${inputCls} mt-3`} value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Anything else?" hint="Optional, up to 500 characters.">
              <textarea
                rows={3}
                maxLength={500}
                className={inputCls}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>

            <div className="mt-4 flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" className="flex-1" busy={busy}>
                Submit report
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
