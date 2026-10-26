import React from 'react';
import { createRoot } from 'react-dom/client';
import CustomerFeedback from './features/customer-feedback/CustomerFeedback.jsx';
createRoot(document.getElementById('root')).render(
  <div className="customer-feedback-root">
    <CustomerFeedback />
  </div>,
);
