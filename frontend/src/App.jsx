import React, { useState, useEffect } from 'react';
import Speedtest from './components/Speedtest';
import LookingGlass from './components/LookingGlass';

export default function App() {
  const [currentView, setCurrentView] = useState('speedtest'); // 'speedtest' | 'looking-glass'
  const [clientIp, setClientIp] = useState('');
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Load config from backend API
    const loadConfig = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/config');
        if (!res.ok) {
          throw new Error(`Failed to load server configurations: HTTP ${res.status}`);
        }
        const data = await res.json();
        
        setClientIp(data.clientIp || '127.0.0.1');
        
        // Use configured servers, or provide fallback if empty
        if (data.speedtest && data.speedtest.servers && data.speedtest.servers.length > 0) {
          setServers(data.speedtest.servers);
        } else {
          // Fallback servers
          setServers([
            { id: 'my', name: 'Malaysia', label: 'MY', host: window.location.origin },
            { id: 'sg', name: 'Singapore', label: 'SG', host: window.location.origin },
            { id: 'hk', name: 'Hong Kong', label: 'HK', host: window.location.origin }
          ]);
        }
        setLoading(false);
      } catch (err) {
        console.error('Config load error:', err);
        setError('Could not connect to the Looking Glass backend service. Make sure the backend server is running.');
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
        <div className="w-10 h-10 border-4 border-[#f9572c] border-t-transparent rounded-full animate-spin"></div>
        <p className="mono font-semibold text-slate-500">Initializing Network Interface...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel text-center max-w-md" style={{ background: 'white' }}>
        <h2 className="font-display text-red-500 text-xl font-bold mb-2">Connection Error</h2>
        <p className="text-slate-600 mb-6">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="btn-primary"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="w-full transition-all duration-300">
      {currentView === 'speedtest' ? (
        <Speedtest
          clientIp={clientIp}
          servers={servers}
          onNavigateToLookingGlass={() => setCurrentView('looking-glass')}
        />
      ) : (
        <LookingGlass
          clientIp={clientIp}
          onBackToSpeedtest={() => setCurrentView('speedtest')}
        />
      )}
    </div>
  );
}
