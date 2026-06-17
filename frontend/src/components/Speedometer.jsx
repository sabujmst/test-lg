import React, { useEffect, useState } from 'react';

// Scale key points for Gigabit mode (1G)
const SCALE_1G = [
  { val: 0, angle: 225 },
  { val: 1, angle: 180 },
  { val: 5, angle: 135 },
  { val: 10, angle: 90 },
  { val: 100, angle: 45 },
  { val: 500, angle: 0 },
  { val: 1000, angle: -45 }
];

// Scale key points for Multi-Gigabit mode (10G)
const SCALE_10G = [
  { val: 0, angle: 225 },
  { val: 10, angle: 180 },
  { val: 50, angle: 135 },
  { val: 100, angle: 90 },
  { val: 1000, angle: 45 },
  { val: 5000, angle: 0 },
  { val: 10000, angle: -45 }
];

/**
 * Interpolates value to angle on the custom speedometer scale.
 */
function getAngleForValue(val, scale) {
  const maxVal = scale[scale.length - 1].val;
  if (val <= 0) return scale[0].angle;
  if (val >= maxVal) return scale[scale.length - 1].angle;

  for (let i = 0; i < scale.length - 1; i++) {
    const start = scale[i];
    const end = scale[i + 1];
    if (val >= start.val && val <= end.val) {
      const ratio = (val - start.val) / (end.val - start.val);
      return start.angle + ratio * (end.angle - start.angle);
    }
  }
  return scale[0].angle;
}

export default function Speedometer({ value = 0, statusText = 'READY' }) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const [scaleMode, setScaleMode] = useState('1G'); // '1G' or '10G'

  // Toggle dial scale mode dynamically depending on speed values
  useEffect(() => {
    if (value > 1000) {
      setScaleMode('10G');
    } else if (value === 0) {
      setScaleMode('1G');
    }
  }, [value]);

  const activeScale = scaleMode === '10G' ? SCALE_10G : SCALE_1G;

  // Butter-smooth continuous lerp animation loop.
  // Uses requestAnimationFrame to smoothly slide the needle towards the target value.
  useEffect(() => {
    let animationFrameId;
    
    const animate = () => {
      setAnimatedValue((prev) => {
        // If we are extremely close to the target value, snap to it to stop animating
        if (Math.abs(value - prev) < 0.01) {
          return value;
        }
        // Lerp step: move 8% of the remaining distance per frame.
        // This simulates physical needle inertia and is extremely smooth.
        return prev + (value - prev) * 0.08;
      });
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value]);

  const targetAngle = getAngleForValue(animatedValue, activeScale);
  
  // Calculate polar coordinates for needle and drawing arcs
  const radius = 130;
  const cx = 175;
  const cy = 175;

  // Convert mathematical angle (degrees) to SVG coordinates
  const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY - radius * Math.sin(angleInRadians) // SVG y-axis is inverted
    };
  };

  // Generate the main arc path d-attribute
  const startBg = polarToCartesian(cx, cy, radius, 225);
  const endBg = polarToCartesian(cx, cy, radius, -45);
  const largeArcFlag = 225 - (-45) <= 180 ? "0" : "1";
  const bgArcPath = `M ${startBg.x} ${startBg.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endBg.x} ${endBg.y}`;

  // Generate progress arc d-attribute
  const progressEnd = polarToCartesian(cx, cy, radius, targetAngle);
  const progressArcFlag = 225 - targetAngle <= 180 ? "0" : "1";
  const progressArcPath = targetAngle < 225 
    ? `M ${startBg.x} ${startBg.y} A ${radius} ${radius} 0 ${progressArcFlag} 1 ${progressEnd.x} ${progressEnd.y}`
    : '';

  // Render ticks
  const ticks = [];
  
  // Add tick marks at each main value of active scale
  activeScale.forEach((pt) => {
    const angle = pt.angle;
    const outerPoint = polarToCartesian(cx, cy, radius + 4, angle);
    const innerPoint = polarToCartesian(cx, cy, radius - 8, angle);
    
    ticks.push(
      <line
        key={`tick-${pt.val}`}
        x1={innerPoint.x}
        y1={innerPoint.y}
        x2={outerPoint.x}
        y2={outerPoint.y}
        stroke="#cbd5e1"
        strokeWidth="2"
      />
    );
  });

  return (
    <div className="flex flex-col items-center justify-center relative select-none" style={{ width: '350px', height: '350px' }}>
      <svg width="100%" height="100%" viewBox="0 0 350 350" className="drop-shadow-sm">
        {/* Glow Filters */}
        <defs>
          <linearGradient id="needleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
          <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.08" />
          </filter>
        </defs>

        {/* Speedometer Background Track */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="16"
          strokeLinecap="round"
        />

        {/* Speedometer Active Progress Track */}
        {progressArcPath && (
          <path
            d={progressArcPath}
            fill="none"
            stroke="url(#progressGrad)"
            strokeWidth="16"
            strokeLinecap="round"
            style={{ transition: 'stroke 0.3s' }}
          />
        )}

        {/* Ticks */}
        {ticks}

        {/* Tick Labels */}
        {activeScale.map((pt) => {
          if (pt.val === 0) return null; // Skip 0 label for cleaner aesthetics
          
          // Position label slightly inside the arc
          const labelAngle = pt.angle;
          const pos = polarToCartesian(cx, cy, radius - 24, labelAngle);
          
          // Format 5000 and 10000 into 5K and 10K for spacing in 10G mode
          let labelText = pt.val;
          if (scaleMode === '10G' && pt.val >= 1000) {
            labelText = `${pt.val / 1000}K`;
          }
          
          return (
            <text
              key={`label-${pt.val}`}
              x={pos.x}
              y={pos.y + 5} // Adjustment for vertical alignment
              fill="#94a3b8"
              fontFamily="Outfit"
              fontWeight="600"
              fontSize={scaleMode === '10G' ? '11' : '12'}
              textAnchor="middle"
            >
              {labelText}
            </text>
          );
        })}

        {/* Animated Needle - Rendered behind the digital readout */}
        <g style={{
          transform: `rotate(${90 - targetAngle}deg)`,
          transformOrigin: `${cx}px ${cy}px`
        }}>
          {/* Needle shape */}
          <polygon
            points={`${cx - 4},${cy - 20} ${cx},${cy - radius + 25} ${cx + 4},${cy - 20}`}
            fill="url(#needleGrad)"
          />
          {/* Center Hub Outer Ring */}
          <circle
            cx={cx}
            cy={cy}
            r="12"
            fill="#ffffff"
            filter="url(#shadow)"
          />
          {/* Center Hub Inner Dot */}
          <circle
            cx={cx}
            cy={cy}
            r="6"
            fill="#f97316"
          />
        </g>

        {/* Center Digital Speed Readout */}
        <text
          x={cx}
          y={cy + 45}
          fill="#0f172a"
          fontFamily="Outfit"
          fontWeight="800"
          fontSize="54"
          textAnchor="middle"
        >
          {Math.round(animatedValue)}
        </text>

        <text
          x={cx}
          y={cy + 75}
          fill="#94a3b8"
          fontFamily="Outfit"
          fontWeight="600"
          fontSize="13"
          letterSpacing="0.2em"
          textAnchor="middle"
        >
          Mbps
        </text>

        <text
          x={cx}
          y={cy + 98}
          fill="#f97316"
          fontFamily="Outfit"
          fontWeight="800"
          fontSize="10.5"
          letterSpacing="0.15em"
          textAnchor="middle"
        >
          {statusText}
        </text>
      </svg>
    </div>
  );
}
