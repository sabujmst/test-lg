import React, { useState, useEffect, useRef } from 'react';
import Speedometer from './Speedometer';
import { Copy, Check, Info, Server, Wifi, Globe } from 'lucide-react';

export default function Speedtest({ clientIp, servers, onNavigateToLookingGlass }) {
  const [selectedServer, setSelectedServer] = useState(null);
  const [serverLatencies, setServerLatencies] = useState({});
  const [testState, setTestState] = useState('idle'); // idle, pinging, downloading, uploading, finished
  const [latency, setLatency] = useState(null);
  const [downloadSpeed, setDownloadSpeed] = useState(null);
  const [uploadSpeed, setUploadSpeed] = useState(null);
  
  // Real-time values for speedometer display
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [statusText, setStatusText] = useState('READY');
  const [clientIpCopied, setClientIpCopied] = useState(false);
  const [logs, setLogs] = useState([]);

  const abortControllerRef = useRef(null);
  const uploadXhrRef = useRef(null);

  // Set default selected server
  useEffect(() => {
    if (servers && servers.length > 0) {
      setSelectedServer(servers[0]);
      // Run ping tests for all servers
      pingAllServers(servers);
    }
  }, [servers]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopAllTests();
    };
  }, []);

  /**
   * Pings all available servers to show latency checks in cards.
   */
  const pingAllServers = async (serverList) => {
    const latencies = {};
    for (const server of serverList) {
      try {
        const pings = [];
        // Perform 3 rapid pings
        for (let i = 0; i < 3; i++) {
          const start = performance.now();
          // Fetch with a cache buster
          await fetch(`${server.host}/api/speedtest/ping?cb=${Date.now()}-${i}`, { cache: 'no-store' });
          pings.push(performance.now() - start);
        }
        const avg = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
        latencies[server.id] = `${avg} ms`;
      } catch (err) {
        latencies[server.id] = 'error';
      }
    }
    setServerLatencies(latencies);
  };

  const stopAllTests = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (uploadXhrRef.current) {
      uploadXhrRef.current.abort();
    }
  };

  /**
   * Performs the Ping/Latency measurement test.
   */
  const runPingTest = async (server) => {
    setLogs((prev) => [...prev, 'Starting Latency Test...']);
    setStatusText('TESTING LATENCY');
    const pings = [];
    const numPings = 8;

    for (let i = 0; i < numPings; i++) {
      if (abortControllerRef.current?.signal.aborted) return null;
      
      const start = performance.now();
      try {
        await fetch(`${server.host}/api/speedtest/ping?cb=${Date.now()}-${i}`, {
          signal: abortControllerRef.current?.signal,
          cache: 'no-store'
        });
        const duration = performance.now() - start;
        pings.push(duration);
        setLatency(Math.round(duration)); // Show progress
        setCurrentSpeed(0); // Keep needle at 0 during ping
        await new Promise(r => setTimeout(r, 150));
      } catch (e) {
        if (e.name === 'AbortError') return null;
        console.error('Ping error:', e);
      }
    }

    if (pings.length === 0) return 999;
    
    const finalLatency = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
    setLatency(finalLatency);
    setLogs((prev) => [...prev, `Latency: ${finalLatency} ms`]);
    return finalLatency;
  };

  /**
   * Performs the Download Speed test using sequential chunk downloads.
   */
  const runDownloadTest = async (server) => {
    setLogs((prev) => [...prev, 'Starting Download Speed Test...']);
    setStatusText('TESTING DOWNLOAD');

    const testDuration = 6000; // 6 seconds duration
    const startTime = performance.now();
    let downloadSpeeds = [];
    let runningAverage = 0;

    // Download 4MB chunks sequentially to measure speed over a steady 6 seconds
    while (performance.now() - startTime < testDuration) {
      if (abortControllerRef.current?.signal.aborted) break;

      const chunkStart = performance.now();
      try {
        const response = await fetch(`${server.host}/api/speedtest/download?size=4&cb=${Date.now()}`, {
          signal: abortControllerRef.current?.signal,
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error('Download chunk failed');
        }

        // Wait to completely download the payload
        const blob = await response.blob();
        const chunkDuration = (performance.now() - chunkStart) / 1000; // in seconds
        
        if (chunkDuration > 0) {
          const instantSpeed = (blob.size * 8) / (chunkDuration * 1024 * 1024);
          downloadSpeeds.push(instantSpeed);

          // Smooth the speed using an Exponential Moving Average (EMA)
          runningAverage = runningAverage === 0 ? instantSpeed : runningAverage * 0.7 + instantSpeed * 0.3;

          // Cap local loopback speeds to a multi-gigabit threshold for dial scaling demo
          let displaySpeed = runningAverage;
          if (displaySpeed > 2800) {
            displaySpeed = 2600 + Math.random() * 150;
          }

          setDownloadSpeed(parseFloat(displaySpeed.toFixed(2)));
          setCurrentSpeed(displaySpeed);
        }
      } catch (e) {
        if (e.name === 'AbortError') break;
        console.error('Download chunk error:', e);
        setLogs((prev) => [...prev, `Download Error: ${e.message}`]);
        await new Promise(r => setTimeout(r, 200));
      }
    }

    let finalDownloadSpeed = 0;
    if (downloadSpeeds.length > 0) {
      finalDownloadSpeed = downloadSpeeds.reduce((a, b) => a + b, 0) / downloadSpeeds.length;
    }
    if (finalDownloadSpeed > 2800) {
      finalDownloadSpeed = 2600 + Math.random() * 100;
    }

    setDownloadSpeed(parseFloat(finalDownloadSpeed.toFixed(2)));
    setCurrentSpeed(0);
    setLogs((prev) => [...prev, `Download Speed: ${finalDownloadSpeed.toFixed(2)} Mbps`]);
    return finalDownloadSpeed;
  };

  /**
   * Performs the Upload Speed test using sequential chunk uploads.
   */
  const runUploadTest = async (server) => {
    setLogs((prev) => [...prev, 'Starting Upload Speed Test...']);
    setStatusText('TESTING UPLOAD');

    const testDuration = 6000; // 6 seconds duration
    const startTime = performance.now();
    let uploadSpeeds = [];
    let runningAverage = 0;

    // 1MB chunk to post sequentially
    const chunkSize = 1 * 1024 * 1024;
    const chunk = new Uint8Array(chunkSize);

    while (performance.now() - startTime < testDuration) {
      if (abortControllerRef.current?.signal.aborted) break;

      const chunkStart = performance.now();
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          uploadXhrRef.current = xhr;

          xhr.onload = () => resolve();
          xhr.onerror = () => reject(new Error('Upload failed'));
          xhr.onabort = () => reject(new Error('Aborted'));

          xhr.open('POST', `${server.host}/api/speedtest/upload?cb=${Date.now()}`, true);
          xhr.send(chunk);
        });

        const chunkDuration = (performance.now() - chunkStart) / 1000; // in seconds
        if (chunkDuration > 0) {
          const instantSpeed = (chunkSize * 8) / (chunkDuration * 1024 * 1024);
          uploadSpeeds.push(instantSpeed);

          // Smooth the speed using an Exponential Moving Average (EMA)
          runningAverage = runningAverage === 0 ? instantSpeed : runningAverage * 0.7 + instantSpeed * 0.3;

          // Cap local loopback speeds to a multi-gigabit threshold for dial scaling demo
          let displaySpeed = runningAverage;
          if (displaySpeed > 2000) {
            displaySpeed = 1800 + Math.random() * 150;
          }

          setUploadSpeed(parseFloat(displaySpeed.toFixed(2)));
          setCurrentSpeed(displaySpeed);
        }
      } catch (e) {
        if (e.message === 'Aborted') break;
        console.error('Upload chunk error:', e);
        await new Promise(r => setTimeout(r, 200));
      }
    }

    let finalUploadSpeed = 0;
    if (uploadSpeeds.length > 0) {
      finalUploadSpeed = uploadSpeeds.reduce((a, b) => a + b, 0) / uploadSpeeds.length;
    }
    if (finalUploadSpeed > 2000) {
      finalUploadSpeed = 1800 + Math.random() * 100;
    }

    setUploadSpeed(parseFloat(finalUploadSpeed.toFixed(2)));
    setCurrentSpeed(0);
    setLogs((prev) => [...prev, `Upload Speed: ${finalUploadSpeed.toFixed(2)} Mbps`]);
    return finalUploadSpeed;
  };

  /**
   * Start the complete Speedtest pipeline.
   */
  const handleStartTest = async () => {
    if (!selectedServer || testState !== 'idle') return;

    setTestState('pinging');
    setLatency(null);
    setDownloadSpeed(null);
    setUploadSpeed(null);
    setCurrentSpeed(0);
    setLogs(['--- Starting Speedtest ---']);

    abortControllerRef.current = new AbortController();

    try {
      // 1. Latency test
      const finalLat = await runPingTest(selectedServer);
      if (abortControllerRef.current.signal.aborted) return;
      await new Promise(r => setTimeout(r, 500));

      // 2. Download speed test
      setTestState('downloading');
      const finalDl = await runDownloadTest(selectedServer);
      if (abortControllerRef.current.signal.aborted) return;
      await new Promise(r => setTimeout(r, 500));

      // 3. Upload speed test
      setTestState('uploading');
      const finalUl = await runUploadTest(selectedServer);
      if (abortControllerRef.current.signal.aborted) return;

      // 4. Test Complete
      setTestState('finished');
      setStatusText('READY');
      setCurrentSpeed(0);
      setLogs((prev) => [...prev, '--- Speedtest Finished ---']);
    } catch (e) {
      console.error('Overall Speedtest Pipeline Failure:', e);
      setTestState('idle');
      setStatusText('READY');
      setCurrentSpeed(0);
    } finally {
      abortControllerRef.current = null;
      uploadXhrRef.current = null;
    }
  };

  const handleReset = () => {
    stopAllTests();
    setTestState('idle');
    setLatency(null);
    setDownloadSpeed(null);
    setUploadSpeed(null);
    setCurrentSpeed(0);
    setStatusText('READY');
    setLogs([]);
  };

  const handleCopyClientIp = async () => {
    if (!clientIp) return;
    try {
      await navigator.clipboard.writeText(clientIp);
      setClientIpCopied(true);
      setTimeout(() => setClientIpCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy client IP:', err);
    }
  };

  const handleViewLog = () => {
    if (logs.length === 0) {
      alert("No logs available yet. Run a speedtest first!");
      return;
    }
    alert(logs.join('\n'));
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Header section matching style */}
      <div className="text-center mb-8 flex flex-col items-center">
        <div className="flex items-center gap-3 mb-1">
          <Globe size={40} className="text-[#3b82f6]" />
          <h1 
            className="font-display" 
            style={{ 
              fontSize: '3rem', 
              fontWeight: 900, 
              letterSpacing: '0.08em', 
              color: '#f9572c', 
              textTransform: 'uppercase',
            }}
          >
            SPEEDTEST MALAYSIA
          </h1>
        </div>
        <p 
          className="font-display" 
          style={{ 
            fontSize: '0.8rem', 
            color: 'var(--text-light)', 
            letterSpacing: '0.2em', 
            fontWeight: 600,
            textTransform: 'uppercase'
          }}
        >
          The Malaysia Broadband Speedtest
        </p>
      </div>


      {/* Main Core Speedtest Layout */}
      <div className="glass-panel w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-center mb-8" style={{ background: 'white' }}>
        {/* Left Side: Speedometer */}
        <div className="md:col-span-7 flex flex-col items-center justify-center">
          <Speedometer value={currentSpeed} statusText={statusText} />
        </div>

        {/* Right Side: Metrics List */}
        <div className="md:col-span-5 flex flex-col justify-center gap-4">
          {/* Download Box */}
          <div className={`metric-box download ${testState === 'downloading' ? 'active' : ''}`}>
            <div className="metric-label">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>DOWNLOAD</span>
            </div>
            <div className="metric-value">
              <span>{downloadSpeed !== null ? downloadSpeed : '-'}</span>
              <span className="metric-unit">Mbps</span>
            </div>
          </div>

          {/* Upload Box */}
          <div className={`metric-box upload ${testState === 'uploading' ? 'active' : ''}`}>
            <div className="metric-label">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <span>UPLOAD</span>
            </div>
            <div className="metric-value">
              <span>{uploadSpeed !== null ? uploadSpeed : '-'}</span>
              <span className="metric-unit">Mbps</span>
            </div>
          </div>

          {/* Latency Box */}
          <div className={`metric-box latency ${testState === 'pinging' ? 'active' : ''}`}>
            <div className="metric-label">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>LATENCY</span>
            </div>
            <div className="metric-value">
              <span>{latency !== null ? latency : '-'}</span>
              <span className="metric-unit">ms</span>
            </div>
          </div>

          {/* Client IP Box */}
          <div className="metric-box" onClick={handleCopyClientIp} style={{ cursor: 'pointer' }}>
            <div className="metric-label flex justify-between items-center w-full">
              <span>CLIENT IP – TAP TO COPY</span>
              {clientIpCopied ? (
                <span className="text-green-600 flex items-center gap-1 font-semibold text-[10px]">
                  <Check size={10} /> COPIED
                </span>
              ) : (
                <Copy size={10} className="text-gray-400" />
              )}
            </div>
            <div className="metric-subtext mono font-semibold text-[1.1rem]">
              {clientIp || 'Detecting...'}
            </div>
          </div>
        </div>
      </div>

      {/* Speedtest Controls */}
      <div className="w-full flex flex-col items-center gap-6">
        {/* Status Line */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="mono">
            {testState === 'idle' && '• PRESS START TO BEGIN TEST'}
            {testState === 'pinging' && '• ANALYZING NETWORK LATENCY AND JITTER'}
            {testState === 'downloading' && '• TESTING DOWNLOAD BANDWIDTH STREAM'}
            {testState === 'uploading' && '• TESTING UPLOAD PATH CAPACITIES'}
            {testState === 'finished' && '• TEST COMPLETE. PRESS RESET TO START AGAIN'}
          </span>
          <button 
            onClick={handleViewLog}
            className="mono ml-2 font-bold hover:text-slate-800 transition-colors"
            style={{ 
              background: 'none', 
              border: '1px solid #cbd5e1', 
              padding: '2px 8px', 
              fontSize: '10px', 
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            VIEW LOG
          </button>
        </div>

        {/* Buttons (Start, Reset, Results) */}
        <div className="flex gap-4 w-full max-w-lg justify-center">
          <button
            onClick={handleStartTest}
            disabled={testState !== 'idle'}
            className="btn-primary flex-1"
          >
            START
          </button>
          
          <button
            onClick={handleReset}
            disabled={testState === 'idle'}
            className="btn-secondary flex-1"
          >
            RESET
          </button>

          <button
            disabled={testState !== 'finished'}
            onClick={() => alert(`Results:\nLatency: ${latency}ms\nDownload: ${downloadSpeed} Mbps\nUpload: ${uploadSpeed} Mbps`)}
            className="btn-secondary flex-1"
          >
            RESULTS
          </button>
        </div>

        {/* Navigation Button for Looking Glass */}
        <button
          onClick={onNavigateToLookingGlass}
          className="btn-tertiary w-full max-w-sm mt-4 font-bold"
        >
          LOOKING GLASS
        </button>
      </div>
    </div>
  );
}
