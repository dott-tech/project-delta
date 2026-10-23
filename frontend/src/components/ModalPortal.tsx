import React from 'react';
import { createPortal } from 'react-dom';

export const ModalPortal: React.FC<React.PropsWithChildren> = ({ children }) =>
  createPortal(
    <div className="app-shell modal-portal-root">{children}</div>,
    document.body,
  );
