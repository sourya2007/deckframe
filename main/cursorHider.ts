import { spawnSync } from 'child_process';

// Windows-only OS cursor hiding for the duration of a recording.
// shortcut: replaces OCR_NORMAL via SetSystemCursor; SPI_SETCURSORORS restore
// also fires on will-quit/exit, but a hard kill (-9) leaves the blank cursor
// until logoff — upgrade to a native helper wgc-style capture that excludes
// the cursor if this ever bites in practice.

const USER32 = `
Add-Type -Namespace DeckFrame -Name Cursor -MemberDefinition '
[DllImport("user32.dll")] public static extern bool SetSystemCursor(IntPtr hcur, uint id);
[DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);
[DllImport("user32.dll")] public static extern IntPtr CreateCursor(IntPtr hInst, int xHot, int yHot, int cx, int cy, IntPtr pvAND, IntPtr pvXOR);
[DllImport("user32.dll")] public static extern IntPtr CopyCursor(IntPtr hcur);
[DllImport("user32.dll")] public static extern bool DestroyCursor(IntPtr hcur);
'
$and = [Runtime.InteropServices.Marshal]::AllocHGlobal(32)
$xor = [Runtime.InteropServices.Marshal]::AllocHGlobal(32)
[Runtime.InteropServices.Marshal]::FillMemory($and, 32, 0xFF)
[Runtime.InteropServices.Marshal]::ZeroMemory($xor, 32)
$blank = [DeckFrame.Cursor]::CreateCursor([IntPtr]::Zero, 0, 0, 32, 32, $and, $xor)
$copy = [DeckFrame.Cursor]::CopyCursor($blank)
[DeckFrame.Cursor]::SetSystemCursor($copy, 32512)   # OCR_NORMAL
[DeckFrame.Cursor]::DestroyCursor($blank)
[Runtime.InteropServices.Marshal]::FreeHGlobal($and)
[Runtime.InteropServices.Marshal]::FreeHGlobal($xor)
`;

const PS_ARGS = ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', '-'];

let hidden = false;

function runPs(script: string) {
  const p = spawnSync('powershell.exe', PS_ARGS, { input: script, windowsHide: true, timeout: 10000 });
  if (p.status !== 0) console.error('cursorHider: powershell failed:', p.stderr?.toString());
}

export function hideOsCursor() {
  if (process.platform !== 'win32' || hidden) return;
  runPs(USER32);
  hidden = true;
}

export function restoreOsCursor() {
  if (process.platform !== 'win32' || !hidden) return;
  // SPI_SETCURSORORS (57) reloads all system cursors from the registry, undoing SetSystemCursor
  runPs('Add-Type -Namespace DeckFrame -Name Cur2 -MemberDefinition \'[DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, IntPtr c, uint d);\'; [DeckFrame.Cur2]::SystemParametersInfo(57, 0, [IntPtr]::Zero, 3)');
  hidden = false;
}
