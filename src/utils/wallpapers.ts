export type WallpaperPresetId = 'aurora' | 'ocean' | 'dusk' | 'forest';

export interface WallpaperPreset {
  id: WallpaperPresetId;
  label: string;
  swatch: string;
  imageUrl: string;
  tint: string;
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'aurora',
    label: 'Twilight Aurora',
    swatch: '#34d399',
    imageUrl: '/src/assets/images/wallpaper_twilight_aurora_1794975129704.jpg',
    tint: 'rgba(52, 211, 153, 0.08)',
  },
  {
    id: 'ocean',
    label: 'Ocean Mist',
    swatch: '#38bdf8',
    imageUrl: '/src/assets/images/wallpaper_ocean_mist_1794975130802.jpg',
    tint: 'rgba(56, 189, 248, 0.07)',
  },
  {
    id: 'dusk',
    label: 'Warm Dusk',
    swatch: '#f59e0b',
    imageUrl: '/src/assets/images/wallpaper_warm_dusk_1794975128871.jpg',
    tint: 'rgba(245, 158, 11, 0.08)',
  },
  {
    id: 'forest',
    label: 'Forest Calm',
    swatch: '#10b981',
    imageUrl: '/src/assets/images/wallpaper_forest_calm_1794975131899.jpg',
    tint: 'rgba(16, 185, 129, 0.07)',
  },
];

export const WALLPAPER_STORAGE_KEY = 'isai-home-wallpaper';
