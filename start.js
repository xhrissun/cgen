import { networkInterfaces } from 'os';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Detect LAN IP
const getLocalIP = () => {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
};

const LOCAL_IP = getLocalIP();
const API_URL = `http://${LOCAL_IP}:5000`;

console.log('\n================================================');
console.log('   CONTRACT MANAGEMENT SYSTEM - STARTING UP    ');
console.log('================================================');
console.log(`  Detected LAN IP : ${LOCAL_IP}`);
console.log(`  Backend target  : ${API_URL}`);
console.log(`  Frontend URL    : http://${LOCAL_IP}:3001`);
console.log('------------------------------------------------');
console.log('  Share this URL with users on your network:');
console.log(`  >>> http://${LOCAL_IP}:3001 <<<`);
console.log('================================================\n');

const env = { ...process.env, VITE_API_URL: API_URL };

// Start backend
const backend = spawn('node', ['server.js'], {
  cwd: resolve(__dirname, 'backend'),
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

// Small delay so backend starts before frontend
setTimeout(() => {
  // Start frontend
  const frontend = spawn('npm', ['run', 'dev'], {
    cwd: resolve(__dirname, 'frontend'),
    env,
    stdio: 'inherit',
    shell: true
  });

  frontend.on('exit', (code) => {
    console.log(`Frontend exited with code ${code}`);
    backend.kill();
    process.exit(code);
  });
}, 2000);

backend.on('exit', (code) => {
  console.log(`Backend exited with code ${code}`);
  process.exit(code);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  backend.kill('SIGINT');
  process.exit(0);
}); 