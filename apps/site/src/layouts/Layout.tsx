import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';

import Footer from './Footer';
import Header from './Header';

/** Scrolls to #anchors after navigation, or to the top on a new page. */
function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      // Wait a frame so the new page has rendered.
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      });
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return null;
}

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ScrollManager />
      <Header />
      <Outlet />
      <Footer />
    </div>
  );
}
