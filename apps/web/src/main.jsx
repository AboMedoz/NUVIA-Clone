import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/700.css';
import App from './app/App.jsx';
import './features/approved-ui/styles/app.css';
import './features/approved-ui/styles/site-chrome.css';
import './features/approved-ui/styles/review.css';
import './features/approved-ui/styles/mobile-workspace.css';
import './features/approved-ui/styles/tablet-workspace.css';
import './features/approved-ui/styles/account-controls.css';
import './styles/integration.css';
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
