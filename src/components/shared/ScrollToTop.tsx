import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * React Router doesn't reset scroll position on navigation by default —
 * clicking a footer/nav link while scrolled down (e.g. clicking "Premium"
 * from the footer) would land on the new page still scrolled to the bottom
 * instead of the top. This restores the expected "new page starts at the
 * top" behavior on every route change.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
