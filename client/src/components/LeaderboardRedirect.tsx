import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';

/**
 * Component that redirects from /leaderboard to /reputation-leaderboard
 * Enhanced with a loading state to prevent blank page issues
 */
const LeaderboardRedirect = () => {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Add a small delay to prevent race conditions during navigation
    const timeoutId = setTimeout(() => {
      setLocation('/reputation-leaderboard');
    }, 50);
    
    // Clean up timeout if component unmounts
    return () => clearTimeout(timeoutId);
  }, [setLocation]);

  // Show a loading indicator instead of null
  // This helps prevent the blank page during transition
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <Loader2 className="h-10 w-10 animate-spin text-white mb-4" />
      <div className="text-white/70">Redirecting to leaderboard...</div>
    </div>
  );
};

export default LeaderboardRedirect;