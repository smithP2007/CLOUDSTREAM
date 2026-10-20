/**
 * Conversion panel: shown when the decision flow offers client-side conversion
 * for a local file. Owns the conversion RUN (progress/cancel/error UI); the
 * engine itself is injected. "Convert and play" is always an explicit action —
 * conversion never starts automatically (D21.5).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversionEngine } from './conversion/ffmpegConversion';
import type { ConversionOfferView } from './types';
import { toPlaybackError } from './errors';

export interface ConversionPanelProps {
  offer: ConversionOfferView;
  engine: ConversionEngine | null;
  getInputFile(itemId: string): File | null;
  onResult(blob: Blob, suggestedName: string, convertedFrom: string): Promise<void>;
  onDismiss(): void;
}

export function ConversionPanel({ offer, engine, getInputFile, onResult, onDismiss }: ConversionPanelProps) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = progress !== null;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const convert = useCallback(async () => {
    if (!engine || busy) return;
    const file = getInputFile(offer.itemId);
    if (!file) {
      setError('The original file is no longer available.');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setProgress(0);
    try {
      const result = await engine.convert(file, {
        profile: offer.profile,
        inputName: file.name,
        signal: controller.signal,
        onProgress: (ratio) => setProgress(ratio),
      });
      const base = file.name.replace(/\.[^.]+$/, '');
      await onResult(result.blob, `${base}.${offer.profile.ext}`, offer.profileLabel);
    } catch (caught) {
      const playbackError = toPlaybackError(caught, 'conversion-failed');
      if (playbackError.code === 'aborted') setError('Conversion cancelled.');
      else setError(playbackError.message);
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  }, [busy, engine, getInputFile, offer, onResult]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const unavailable = engine != null && !engine.availability.available;

  return (
    <section className="csw-panel csw-conversion" aria-label="Convert to play">
      <h3 className="csw-panel-title">Convert and play</h3>
      <p className="csw-conversion-reason">{offer.reason}</p>
      <p className="csw-conversion-plan">
        Output: <strong>{offer.profileLabel}</strong> (runs entirely on your device; the original file is kept).
      </p>
      {unavailable ? (
        <p className="csw-conversion-error" role="alert">
          Conversion is unavailable in this browser: {engine?.availability.reason}
        </p>
      ) : (
        <div className="csw-conversion-actions">
          <button type="button" className="csw-btn csw-btn-primary" onClick={() => void convert()} disabled={busy}>
            Convert and play
          </button>
          {busy ? (
            <button type="button" className="csw-btn" onClick={cancel}>
              Cancel
            </button>
          ) : null}
          <button type="button" className="csw-btn csw-btn-ghost" onClick={onDismiss} disabled={busy}>
            Dismiss
          </button>
        </div>
      )}
      {busy ? (
        <div className="csw-conversion-progress" role="progressbar" aria-valuenow={Math.round((progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="csw-conversion-bar" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          <span className="csw-conversion-progress-label">{Math.round((progress ?? 0) * 100)}%</span>
        </div>
      ) : null}
      {error ? (
        <p className="csw-conversion-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
