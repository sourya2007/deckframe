import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {CountdownOverlay} from './overlays/CountdownOverlay.tsx';
import {HudOverlay} from './overlays/HudOverlay.tsx';
import {SourceSelectorOverlay} from './overlays/SourceSelectorOverlay.tsx';
import {ExportRunner} from './overlays/ExportRunner.tsx';
import './index.css';

// Overlay windows (transparent, frameless) are the same bundle; the main
// process picks the surface via index.html?windowType=<type>.
const windowType = new URLSearchParams(window.location.search).get('windowType');

const Root = windowType === 'countdown' ? <CountdownOverlay />
  : windowType === 'hud-overlay' ? <HudOverlay />
  : windowType === 'source-selector' ? <SourceSelectorOverlay />
  : windowType === 'export' ? <ExportRunner />
  : <App />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {Root}
  </StrictMode>,
);
