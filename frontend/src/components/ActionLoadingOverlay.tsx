import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ACTION_LOADING_EVENT, type ActionLoadingEventDetail } from '../utils/actionLoading';
import { LoadingCard } from './LoadingCard';

export const ActionLoadingOverlay: React.FC = () => {
  const [label, setLabel] = useState('Saving your changes');
  const [visible, setVisible] = useState(false);
  const pending = useRef(new Map<number, string>());
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const handleActionLoading = (event: Event) => {
      const { active, requestId, label: actionLabel } = (event as CustomEvent<ActionLoadingEventDetail>).detail;

      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }

      if (active) {
        pending.current.set(requestId, actionLabel);
        setLabel(actionLabel);
        if (showTimer.current === null && !visible) {
          showTimer.current = window.setTimeout(() => {
            showTimer.current = null;
            if (pending.current.size > 0) setVisible(true);
          }, 180);
        }
        return;
      }

      pending.current.delete(requestId);
      if (pending.current.size === 0) {
        if (showTimer.current !== null) {
          window.clearTimeout(showTimer.current);
          showTimer.current = null;
        }
        hideTimer.current = window.setTimeout(() => {
          hideTimer.current = null;
          setVisible(false);
        }, 140);
      } else {
        const latestLabel = Array.from(pending.current.values()).at(-1);
        if (latestLabel) setLabel(latestLabel);
      }
    };

    window.addEventListener(ACTION_LOADING_EVENT, handleActionLoading);
    return () => {
      window.removeEventListener(ACTION_LOADING_EVENT, handleActionLoading);
      if (showTimer.current !== null) window.clearTimeout(showTimer.current);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, [visible]);

  if (!visible) return null;

  return createPortal(
    <div className="action-loading-backdrop" role="presentation">
      <LoadingCard label={label} caption="Keeping your project workspace in sync" />
    </div>,
    document.body,
  );
};
