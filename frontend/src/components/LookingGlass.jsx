import React, { useState, useRef, useEffect } from 'react';
import Terminal from './Terminal';
import { ArrowLeft, Play, Square, Globe } from 'lucide-react';

const TABS = [
  { id: 'ping', label: 'PING' },
  { id: 'traceroute', label: 'TRACEROUTE' },
  { id: 'mtr', label: 'MTR' },
  { id: 'bgp', label: 'BGP' },
  { id: 'ping6', label: 'IPV6 PING' }
];

export default function LookingGlass({ clientIp, onBackToSpeedtest }) {
  const [activeTab, setActiveTab] = useState('ping');
  const [target, setTarget] = useState('');
  const [resolveDns, setResolveDns] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  
  const abortControllerRef = useRef(null);

  // Set default target to client IP on mount
  useEffect(() => {
    if (clientIp) {
      setTarget(clientIp);
    }
  }, [clientIp]);

  // Clean up any running stream on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleRun = async (e) => {
    if (e) e.preventDefault();
    if (!target.trim() || isRunning) return;

    setIsRunning(true);
    setLogs([]);
    
    // Setup abort controller for streaming cancel
    abortControllerRef.current = new AbortController();

    try {
      const queryParams = new URLSearchParams({
        type: activeTab,
        target: target.trim(),
        resolve: resolveDns ? 'true' : 'false'
      });

      setLogs([`Connecting to server stream...\n`]);
      
      const response = await fetch(`/api/diagnose?${queryParams.toString()}`, {
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      // Clear initial connecting log and start receiving stream
      setLogs([]);

      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // Split logs by newline to push arrays to Terminal
        const lines = buffer.split('\n');
        // Keep the last partial line in buffer
        buffer = lines.pop();

        if (lines.length > 0) {
          setLogs((prev) => [...prev, ...lines]);
        }
      }
      
      if (buffer) {
        setLogs((prev) => [...prev, buffer]);
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        // Log is already written by cancellation handler or backend close callback
      } else {
        setLogs((prev) => [...prev, `ERROR: ${err.message}\n`]);
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsRunning(false);
      setLogs((prev) => [...prev, `[Execution aborted by client]\n`]);
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Header section matching looking glass style */}
      <div className="text-center mb-8 flex flex-col items-center">
        <h1 
          className="font-display" 
          style={{ 
            fontSize: '3.5rem', 
            fontWeight: 900, 
            letterSpacing: '0.15em', 
            color: '#f9572c', 
            textTransform: 'uppercase',
            marginBottom: '0.2rem'
          }}
        >
          LOOKING GLASS
        </h1>
        <p 
          className="font-display" 
          style={{ 
            fontSize: '0.8rem', 
            color: 'var(--text-light)', 
            letterSpacing: '0.25em', 
            fontWeight: 600,
            textTransform: 'uppercase',
            marginBottom: '0.6rem'
          }}
        >
          Network Diagnostic Tool
        </p>
        <div className="flex items-center gap-1.5" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="mono font-semibold">www.speedtest.my</span>
        </div>
      </div>

      {/* Navigation and Title */}
      <div className="w-full flex items-center justify-between mb-6">
        <button 
          onClick={onBackToSpeedtest}
          className="btn-secondary flex items-center gap-2"
          style={{ padding: '0.6rem 1.25rem', fontSize: '0.9rem', borderRadius: 'var(--border-radius-sm)' }}
        >
          <ArrowLeft size={16} />
          <span>SPEED TEST</span>
        </button>
        <div 
          className="font-display mono" 
          style={{ 
            color: 'var(--text-light)', 
            fontSize: '0.9rem', 
            fontWeight: 700, 
            letterSpacing: '0.05em' 
          }}
        >
          / LOOKING GLASS
        </div>
      </div>

      {/* Main Glass Panel Tool Area */}
      <div className="glass-panel w-full mb-8 flex flex-col gap-6" style={{ background: 'white' }}>
        {/* Tabs */}
        <div className="tabs-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (!isRunning) {
                  setActiveTab(tab.id);
                }
              }}
              disabled={isRunning}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Input Controls Form */}
        <form onSubmit={handleRun} className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="w-full relative">
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="203.76.99.254 or google.com"
                disabled={isRunning}
                className="input-field"
                required
              />
            </div>
            
            {isRunning ? (
              <button
                type="button"
                onClick={handleStop}
                className="btn-primary w-full md:w-auto"
                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}
              >
                <Square size={16} fill="white" />
                <span>STOP</span>
              </button>
            ) : (
              <button
                type="submit"
                className="btn-primary w-full md:w-auto"
              >
                <Play size={16} fill="white" />
                <span>RUN</span>
              </button>
            )}
          </div>

          {/* DNS Resolution Switch */}
          <div className="flex justify-between items-center px-1">
            <label className="switch-container">
              <span className="switch">
                <input
                  type="checkbox"
                  checked={resolveDns}
                  onChange={(e) => setResolveDns(e.target.checked)}
                  disabled={isRunning}
                />
                <span className="slider"></span>
              </span>
              <span className="mono">Resolve reverse DNS</span>
            </label>
          </div>
        </form>

        {/* Output Console Component */}
        <Terminal logs={logs} onClear={handleClearLogs} />
      </div>

      {/* Footer */}
      <div className="w-full text-center py-4" style={{ fontSize: '0.8rem', color: 'var(--text-light)', borderTop: '1px solid rgba(226, 232, 240, 0.4)' }}>
        <p className="mono">© 2026 NewMedia Express Pte Ltd. All rights reserved.</p>
      </div>
    </div>
  );
}
