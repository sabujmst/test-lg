# Arista EOS Looking Glass & Network Speedtest Dashboard

A premium, visually-stunning, and highly-performant **Speedtest and Network Diagnostics (Looking Glass)** dashboard. This application connects directly to an **Arista EOS** router via SSH to execute real-time diagnostics, falling back to local server-side command execution if no router is configured.

Features a dynamic **10G speedometer dial (with physics-based smooth animation damping)**, real-time command streaming console, and multi-location selection.

---

## 🌟 Key Features

* **Visual & Fluid Speedometer**: Circular SVG dial that auto-scales dynamically between a 1G scale (`1, 5, 10, 100, 500, 1000 Mbps`) and a 10G scale (`10, 50, 100, 1K, 5K, 10K Mbps`) if speeds exceed 1 Gbps.
* **Real-time Diagnostic Streams**: Monospace diagnostic terminal window that streams command outputs (Ping, Traceroute, MTR, BGP, IPv6 Ping) line-by-line using chunked response transfer encoding.
* **Arista EOS Integration**: Backend execution engine connects to Arista switches/routers via SSH, runs queries, and returns outputs in real-time.
* **Local Fallback Mode**: If running locally without a router, the system executes native POSIX (Linux/macOS) or Windows console utilities.
* **Secure by Design**: Inputs are strictly validated against character patterns to prevent command-injection vulnerabilities.
* **Docker Support**: Containerized using multi-stage builds and packaged for single-command `docker-compose` setup.

---

## 📂 Project Architecture

```
Looking-Glass/
├── backend/
│   ├── config/
│   │   └── default.json       # Customizable server list, fallback commands, switch configs
│   ├── src/
│   │   ├── router.js          # Execution controller (Arista SSH / local execution)
│   │   ├── server.js          # Express app, security, rate limiters, gzip compression
│   │   └── speedtest.js       # Bandwidth test chunk buffers & upload handlers
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Speedometer.jsx # Responsive Dial with 10G dynamic auto-scaling
│   │   │   ├── Speedtest.jsx   # Download/Upload/Latency test controls
│   │   │   ├── LookingGlass.jsx# Diagnostics interface
│   │   │   └── Terminal.jsx    # Real-time console logs displayer
│   │   ├── App.jsx            # Layout orchestrator
│   │   └── index.css          # Design system, grid canvas, CSS parameters
│   └── package.json
├── Dockerfile                 # Multi-stage production container build rules
├── docker-compose.yml         # Container orchestrator
├── package.json               # Root scripts runner
└── README.md                  # Installation & deployment instructions
```

---

## ⚙️ Configuration

### 1. Environment Variables (`backend/.env`)
Create `backend/.env` (an example template is provided in `backend/.env.example`). These credentials are used by the backend to establish the SSH session specifically for BGP commands:
```env
PORT=5000

# Arista EOS Credentials (required for BGP queries)
ROUTER_HOST=192.168.1.1
ROUTER_PORT=22
ROUTER_USER=admin
ROUTER_PASSWORD=your_password
ROUTER_KEY_PATH= # Optional path to private key file for key-based authentication
```

### 2. Location & Custom Commands Config (`backend/config/default.json`)
Modify [default.json](file:///d:/OneDrive%20-%20Link3%20Technologies%20Ltd/Desktop/Looking-Glass/backend/config/default.json) to configure your server test nodes and commands:
* `speedtest.servers`: Array of servers with names, hosts, and latencies.
* `localCommands`: Commands executed locally on the server (Win32 and Linux/POSIX supported) for `ping`, `traceroute`, `mtr`, and `ping6`.
* `routerCommands`: SSH commands executed on the Arista EOS router for BGP (e.g., `show ip bgp {target}`).

---

## 🐋 Docker Installation (Ubuntu)

Follow these steps to run the application inside Docker on **Ubuntu 20.04/22.04+**:

### 1. Install Docker & Docker Compose
If Docker is not already installed on your Ubuntu host:
```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
```

### 2. Setup Configuration
Ensure your environment variables are configured in `backend/.env` (see the Environment Variables section above).

### 3. Deploy using Docker Compose
From the root directory of the project, run:
```bash
sudo docker-compose up -d --build
```
This builds the multi-stage image, mounts the networking capabilities (`NET_ADMIN` needed for local ping/mtr diagnostics), and starts the container in the background.

* Access the dashboard by visiting: **`http://<your-server-ip>:5000/`**
* Stop the container at any time:
  ```bash
  sudo docker-compose down
  ```

---

## 🛠️ Direct Installation (Without Docker - Ubuntu)

To run the application directly on Ubuntu host:

### 1. Install Node.js & Dependencies
Install Node.js (v18+) and system tools required for local diagnostics fallback:
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install local fallback diagnostic utilities
sudo apt-get install -y iputils-ping traceroute mtr-tiny
```

### 2. Install Project Packages
From the root directory:
```bash
npm run install-all
```

### 3. Run in Production Mode
Build the static frontend bundle and start the unified server:
```bash
npm run build
npm start
```
The application will listen on port `5000`.

### 4. Run in Development Mode
To run both backend and frontend development servers concurrently:
```bash
npm run dev
```
* Backend: `http://localhost:5000`
* Frontend: `http://localhost:5173` (with hot-module reloading and backend API proxying)
