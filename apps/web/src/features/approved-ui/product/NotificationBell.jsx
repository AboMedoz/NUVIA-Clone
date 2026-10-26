import React from 'react';
import { useProductView } from './ProductContext.jsx';

export default function NotificationBell() {
  const ui = useProductView();
  const unread = !ui.connected || ui.unreadNotifications > 0;
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M10.6 19.1a1.6 1.6 0 0 0 2.8 0M5.1 14.6c-.5.5-.1 1.4.6 1.4h12.6c.7 0 1.1-.9.6-1.4-1.1-1.1-2.2-2.2-2.2-5.8a4.7 4.7 0 0 0-9.4 0c0 3.6-1.1 4.7-2.2 5.8Z"
        stroke="#64738a"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {unread && (
        <circle
          data-name="Unread notification indicator"
          cx="19"
          cy="4"
          r="2.5"
          fill="#1e68ef"
          stroke="white"
        />
      )}
    </svg>
  );
}
