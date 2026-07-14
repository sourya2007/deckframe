# DeckFrame

A cinematic screen recorder and 3D video editor.

## Setup & Run

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Build for Windows (.exe):**
   ```bash
   npm run dist:win
   ```

3. **Locate Build:**
   The installer will be at `release/DeckFrame Setup 1.0.0.exe` and the portable build at `release/DeckFrame 1.0.0.exe`.

*Note: The generated .exe will be unsigned. Windows SmartScreen may warn on first run. Click "More info" > "Run anyway". To add a certificate later, configure `win.certificateFile` in `electron-builder.yml`.*
