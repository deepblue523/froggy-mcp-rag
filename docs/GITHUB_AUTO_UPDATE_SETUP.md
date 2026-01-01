# GitHub Auto-Update Setup Guide

This guide explains how to leverage GitHub Releases as an update server for your Electron application using `electron-updater`.

## Overview

The application is now configured to automatically check for updates from GitHub Releases. When a new release is published on GitHub, users will be notified and can download/install the update directly from the application.

## Prerequisites

1. **GitHub Repository**: Your code must be in a GitHub repository
2. **GitHub Token**: You need a GitHub Personal Access Token (PAT) with `repo` permissions
3. **electron-builder**: Already configured in `package.json`

## Configuration Steps

### 1. Update package.json

Update the `publish` section in `package.json` with your GitHub repository details:

```json
"publish": {
  "provider": "github",
  "owner": "YOUR_GITHUB_USERNAME",
  "repo": "YOUR_REPOSITORY_NAME"
}
```

**Example:**
```json
"publish": {
  "provider": "github",
  "owner": "johndoe",
  "repo": "froggy-mcp-rag"
}
```

### 2. Create GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name (e.g., "Electron Auto-Updates")
4. Select the `repo` scope (this gives full control of private repositories)
5. Click "Generate token"
6. **Copy the token immediately** (you won't be able to see it again)

### 3. Set Environment Variable

Set the `GH_TOKEN` environment variable with your GitHub token:

**Windows (PowerShell):**
```powershell
$env:GH_TOKEN = "your_github_token_here"
```

**Windows (Command Prompt):**
```cmd
set GH_TOKEN=your_github_token_here
```

**macOS/Linux:**
```bash
export GH_TOKEN=your_github_token_here
```

**For persistent setup**, add it to your shell profile:
- Windows: Add to System Environment Variables
- macOS/Linux: Add to `~/.bashrc` or `~/.zshrc`

### 4. Build and Publish

Build your application and publish to GitHub Releases:

```bash
npm run build
```

This will:
1. Build the application for your platform
2. Create a GitHub Release (if it doesn't exist)
3. Upload the built artifacts to the release
4. Generate update metadata files (`latest.yml`, `latest-mac.yml`, etc.)

**Note:** The first time you publish, electron-builder will create a release. Subsequent builds will update the existing release.

## How It Works

### Update Flow

1. **Check for Updates**: The app automatically checks for updates:
   - On startup (if not in dev mode)
   - Every 4 hours while running
   - Manually via IPC (if you add UI controls)

2. **Update Available**: When an update is found:
   - The main process receives an `update-available` event
   - This is sent to the renderer process via IPC
   - You can show a notification to the user

3. **Download Update**: User can choose to download:
   - Download progress is tracked and sent to renderer
   - Progress updates are available via IPC events

4. **Install Update**: After download completes:
   - User can choose to install immediately
   - Or the update will auto-install on next app quit (if configured)

### Update Events

The following events are available in the renderer process:

- `update-available`: New version is available
- `update-not-available`: Current version is latest
- `update-error`: Error occurred while checking/downloading
- `update-download-progress`: Download progress updates
- `update-downloaded`: Update downloaded and ready to install

### IPC Methods

Available methods in the renderer (via `window.electronAPI`):

- `checkForUpdates()`: Manually check for updates
- `downloadUpdate()`: Download the available update
- `installUpdate()`: Install the downloaded update

## Adding Update UI

You can add update notifications to your UI. Here's an example:

```javascript
// Listen for update events
window.electronAPI.onUpdateAvailable((info) => {
  console.log('Update available:', info.version);
  // Show notification to user
  showUpdateNotification(info);
});

window.electronAPI.onUpdateDownloadProgress((progress) => {
  console.log('Download progress:', progress.percent);
  // Update progress bar
  updateProgressBar(progress.percent);
});

window.electronAPI.onUpdateDownloaded((info) => {
  console.log('Update downloaded:', info.version);
  // Show install prompt
  showInstallPrompt(info);
});

// Manual check
async function checkForUpdates() {
  const result = await window.electronAPI.checkForUpdates();
  if (result.success) {
    console.log('Checking for updates...');
  }
}

// Download update
async function downloadUpdate() {
  const result = await window.electronAPI.downloadUpdate();
  if (result.success) {
    console.log('Downloading update...');
  }
}

// Install update
async function installUpdate() {
  const result = await window.electronAPI.installUpdate();
  if (result.success) {
    console.log('Installing update...');
    // App will restart
  }
}
```

## Version Management

### Semantic Versioning

Use semantic versioning for your releases:
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes

### Updating Version

You can use the automated version bump script:

**Quick patch bump (1.0.0 -> 1.0.1):**
```bash
npm run version:patch
```

**Minor bump (1.0.0 -> 1.1.0):**
```bash
npm run version:minor
```

**Major bump (1.0.0 -> 2.0.0):**
```bash
npm run version:major
```

The script will:
1. Automatically increment the version in `package.json`
2. Display the new version
3. Show you the next steps (commit, tag, push, publish)

**Manual version update:**
1. Update `version` in `package.json`:
   ```json
   "version": "1.0.1"
   ```

2. Commit and tag the release:
   ```bash
   git add package.json
   git commit -m "Bump version to 1.0.1"
   git tag v1.0.1
   git push origin main --tags
   ```

3. Build and publish:
   ```bash
   npm run build:publish
   ```

**One-command release (patch bump + build + publish):**
```bash
npm run release
```

This will automatically bump the patch version and publish to GitHub.

## Release Workflow

### Recommended Workflow

**Option 1: Automated (Recommended)**
```bash
# Bump version, commit, tag, and publish in one go
npm run version:patch
git add package.json
git commit -m "Bump version to $(node -p "require('./package.json').version")"
git tag v$(node -p "require('./package.json').version")
git push origin main --tags
npm run build:publish
```

**Option 2: One-command release (patch only)**
```bash
npm run release  # Bumps patch version and publishes
# Then manually commit and tag:
git add package.json
git commit -m "Bump version to $(node -p "require('./package.json').version")"
git tag v$(node -p "require('./package.json').version")
git push origin main --tags
```

**Option 3: Manual**
1. **Development**: Make changes in your codebase
2. **Version Bump**: Run `npm run version:patch` (or `minor`/`major`)
3. **Commit & Tag**: Commit changes and create a git tag
4. **Build & Publish**: Run `npm run build:publish`
5. **Users**: Users receive update notifications automatically

### Automated Workflow (GitHub Actions)

You can automate releases using GitHub Actions. Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npm run build
      
      - name: Publish
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npm run build -- --publish always
```

## Troubleshooting

### Updates Not Detected

1. **Check GitHub Repository**: Ensure `owner` and `repo` in `package.json` are correct
2. **Check Release**: Verify a release exists on GitHub with the correct version
3. **Check Token**: Ensure `GH_TOKEN` is set correctly
4. **Check Network**: Ensure the app can reach GitHub API
5. **Check Logs**: Look for errors in the console

### Build Fails

1. **Token Permissions**: Ensure your GitHub token has `repo` scope
2. **Repository Access**: Ensure the token has access to the repository
3. **Version Format**: Ensure version follows semantic versioning

### Update Download Fails

1. **Network Issues**: Check internet connection
2. **GitHub API Rate Limits**: Wait and try again
3. **File Permissions**: Ensure app has write permissions

## Security Considerations

1. **Token Security**: Never commit your GitHub token to the repository
2. **Use Environment Variables**: Always use environment variables for tokens
3. **Code Signing**: Consider code signing for production releases
4. **HTTPS Only**: Updates are downloaded over HTTPS from GitHub

## Code Signing (Optional but Recommended)

For production releases, consider code signing:

**Windows:**
```json
"win": {
  "certificateFile": "path/to/certificate.pfx",
  "certificatePassword": "password"
}
```

**macOS:**
```json
"mac": {
  "identity": "Developer ID Application: Your Name"
}
```

## Additional Resources

- [electron-updater Documentation](https://www.electron.build/auto-update)
- [electron-builder Documentation](https://www.electron.build/)
- [GitHub Releases API](https://docs.github.com/en/rest/releases)

## Summary

Your Electron app is now configured for auto-updates via GitHub Releases. Key points:

1. ✅ `electron-updater` is installed
2. ✅ Auto-update logic is in `main.js`
3. ✅ IPC handlers are set up
4. ✅ Preload API is exposed
5. ⚠️ **Action Required**: Update `package.json` with your GitHub username and repository name
6. ⚠️ **Action Required**: Set `GH_TOKEN` environment variable
7. ⚠️ **Optional**: Add update UI to your renderer process

After completing the action items, build and publish your first release to test the auto-update functionality!

