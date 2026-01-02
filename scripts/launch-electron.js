#!/usr/bin/env node

/**
 * Launches Electron without showing a console window (Windows)
 * Falls back to normal launch on other platforms
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const isWindows = os.platform() === 'win32';
const electronPath = require('electron');
const appPath = path.join(__dirname, '..');

// Get all arguments passed to this script
const args = process.argv.slice(2);

if (isWindows) {
  // On Windows, use spawn with detached option and hide console
  // Use 'ignore' for stdio to prevent console window from appearing
  const electronProcess = spawn(electronPath, [appPath, ...args], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: false
  });
  
  // Unref the process so parent can exit
  electronProcess.unref();
  
  // Exit immediately, letting Electron run independently
  // Small delay to ensure process starts
  setTimeout(() => {
    process.exit(0);
  }, 100);
} else {
  // On Unix-like systems, just spawn normally
  const electronProcess = spawn(electronPath, [appPath, ...args], {
    stdio: 'inherit',
    detached: false
  });
  
  electronProcess.on('exit', (code) => {
    process.exit(code || 0);
  });
  
  // Handle errors
  electronProcess.on('error', (err) => {
    console.error('Failed to start Electron:', err);
    process.exit(1);
  });
}

