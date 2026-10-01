/** True when the visitor has explicitly entered demo mode ("Try the demo"). */
export function isDemoMode(): boolean {
  try { return localStorage.getItem('ballotlens_demo') === 'true'; } catch { return false; }
}
