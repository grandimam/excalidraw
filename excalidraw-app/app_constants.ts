// time constants (ms)
export const SAVE_TO_LOCAL_STORAGE_TIMEOUT = 300;
export const LOAD_IMAGES_TIMEOUT = 500;
export const SYNC_BROWSER_TABS_TIMEOUT = 50;
export const DELETED_ELEMENT_TIMEOUT = 24 * 60 * 60 * 1000; // 1 day

export const STORAGE_KEYS = {
  LOCAL_STORAGE_ELEMENTS: "excalidraw",
  LOCAL_STORAGE_APP_STATE: "excalidraw-state",
  LOCAL_STORAGE_THEME: "excalidraw-theme",
  VERSION_DATA_STATE: "version-dataState",
  VERSION_FILES: "version-files",

  IDB_LIBRARY: "excalidraw-library",

  // do not use apart from migrations
  __LEGACY_LOCAL_STORAGE_LIBRARY: "excalidraw-library",
} as const;
