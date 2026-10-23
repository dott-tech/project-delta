import React from 'react';
import { Building2 } from 'lucide-react';

interface LoadingCardProps {
  label: string;
  caption: string;
}

export const LoadingCard: React.FC<LoadingCardProps> = ({ label, caption }) => (
  <section className="action-loading-card" role="status" aria-live="polite" aria-busy="true">
    <div className="action-loading-emblem" aria-hidden="true">
      <span className="action-loading-orbit action-loading-orbit-outer" />
      <span className="action-loading-icon"><Building2 /></span>
    </div>
    <p className="action-loading-kicker">STRUCTURAL HUB</p>
    <h2>{label}</h2>
    <p className="action-loading-caption">{caption}</p>
    <div className="action-loading-progress" aria-hidden="true"><span /></div>
  </section>
);
