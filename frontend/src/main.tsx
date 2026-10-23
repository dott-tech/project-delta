import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ActionLoadingOverlay } from './components/ActionLoadingOverlay';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
      <ActionLoadingOverlay />
    </AuthProvider>
  </React.StrictMode>
);
