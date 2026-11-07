import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';

import Layout from '@/layouts/Layout';
import HomePage from '@/pages/Home';
import PartnerPage from '@/pages/Partners';
import PrivacyPage from '@/pages/Privacy';
import NotFoundPage from '@/pages/NotFound';
import './globals.css';
import { inject } from '@vercel/analytics';

// Anonymous visit counts for the website: no cookies, nothing that identifies a visitor.
// Recorded once Web Analytics is enabled on the Vercel project (DEPLOY.md, Analytics).
inject({ framework: 'vite' });

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/partners" element={<PartnerPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
