import React, { useRef, useEffect, useState } from 'react';
import { Copy, Trash2, Check } from 'lucide-react';

export default function Terminal({ logs = [], onClear }) {
  const terminalEndRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // Auto scroll to bottom when logs update
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleCopy = async () => {
    if (logs.length === 0) return;
    try {
      const textToCopy = logs.join('\n');
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div 
      className="glass-panel" 
      style={{ 
        padding: 0, 
        overflow: 'hidden', 
        borderRadius: 'var(--border-radius-sm)', 
        border: '1px solid var(--term-border)' 
      }}
    >
      {/* Terminal Title Bar */}
      <div 
        className="flex items-center justify-between" 
        style={{ 
          background: '#0f172a', 
          borderBottom: '1px solid var(--term-border)', 
          padding: '0.75rem 1.25rem' 
        }}
      >
        <span 
          className="font-display" 
          style={{ 
            color: 'var(--text-light)', 
            fontSize: '0.75rem', 
            fontWeight: 700, 
            letterSpacing: '0.15em', 
            textTransform: 'uppercase' 
          }}
        >
          Output Console
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5"
            style={{
              background: 'none',
              border: 'none',
              color: logs.length === 0 ? 'var(--text-light)' : 'var(--term-text)',
              opacity: logs.length === 0 ? 0.3 : 0.8,
              cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600,
              fontFamily: 'Outfit',
              letterSpacing: '0.05em'
            }}
          >
            {copied ? (
              <>
                <Check size={14} className="text-green-500" />
                <span>COPIED</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>COPY</span>
              </>
            )}
          </button>
          
          <button
            onClick={onClear}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5"
            style={{
              background: 'none',
              border: 'none',
              color: logs.length === 0 ? 'var(--text-light)' : 'var(--term-text)',
              opacity: logs.length === 0 ? 0.3 : 0.8,
              cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600,
              fontFamily: 'Outfit',
              letterSpacing: '0.05em'
            }}
          >
            <Trash2 size={14} />
            <span>CLEAR</span>
          </button>
        </div>
      </div>

      {/* Terminal Screen */}
      <div 
        className="mono"
        style={{ 
          background: 'var(--term-bg)', 
          color: 'var(--term-text)', 
          padding: '1.5rem', 
          height: '350px', 
          overflowY: 'auto', 
          fontSize: '0.85rem',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap'
        }}
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
            Enter a target and press RUN.
          </div>
        ) : (
          <div>
            {logs.map((line, index) => {
              // Highlight commands or status lines
              let style = {};
              if (line.startsWith('---') || line.startsWith('>')) {
                style = { color: 'var(--term-accent)', fontWeight: 600 };
              } else if (line.startsWith('ERROR:') || line.includes('Error')) {
                style = { color: '#ef4444' };
              }
              return (
                <div key={index} style={style}>
                  {line}
                </div>
              );
            })}
            <div ref={terminalEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
