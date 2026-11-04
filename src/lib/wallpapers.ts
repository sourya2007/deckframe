// Built-in wallpapers ship with the app so exports work offline. Custom
// wallpapers are stored as absolute paths in the project file.
const modules = import.meta.glob('../assets/wallpapers/*.{jpg,jpeg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export interface WallpaperOption {
  id: string;
  label: string;
  url: string;
}

function titleCase(id: string) {
  return id
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export const WALLPAPERS: WallpaperOption[] = Object.entries(modules)
  .map(([path, url]) => {
    const id = path.split('/').pop()!;
    return { id, label: titleCase(id), url };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

export const DEFAULT_WALLPAPER = 'tahoe-light.jpg';

const BUILT_INS = new Map(WALLPAPERS.map(w => [w.id, w.url]));

export function wallpaperUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const builtIn = BUILT_INS.get(value);
  if (builtIn) return builtIn;
  if (/^(data:|https?:|file:)/i.test(value)) return value;
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('\\\\')) {
    return 'file:///' + value.replace(/\\/g, '/');
  }
  return null;
}
