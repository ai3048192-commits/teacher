import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // تأكد من استيرادها
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter> {/* يجب أن تحيط بالتطبيق كله هنا */}
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);