/**
 * This file deals with saving data state (appState, elements, images, ...)
 * locally to the browser.
 */

import { clearAppStateForLocalStorage } from "@excalidraw/excalidraw/appState";
import {
  CANVAS_SEARCH_TAB,
  DEFAULT_SIDEBAR,
  debounce,
} from "@excalidraw/common";
import {
  createStore,
  entries,
  del,
  getMany,
  set,
  setMany,
  get,
} from "idb-keyval";

import { appJotaiStore, atom } from "excalidraw-app/app-jotai";
import { getNonDeletedElements } from "@excalidraw/element";
import { isInitializedImageElement } from "@excalidraw/element";

import type { LibraryPersistedData } from "@excalidraw/excalidraw/data/library";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import type { MaybePromise } from "@excalidraw/common/utility-types";

import { SAVE_TO_LOCAL_STORAGE_TIMEOUT, STORAGE_KEYS } from "../app_constants";

const filesStore = createStore("files-db", "files-store");

export const localStorageQuotaExceededAtom = atom(false);

const updateBrowserStateVersion = (key: string) => {
  const timestamp = Date.now().toString();
  localStorage.setItem(key, timestamp);
};

class LocalFileStorage {
  private savedFiles = new Map<FileId, true>();
  private savingFiles = new Map<FileId, true>();

  async clearObsoleteFiles(opts: { currentFileIds: FileId[] }) {
    await entries(filesStore).then((entries) => {
      for (const [id, imageData] of entries as [FileId, BinaryFileData][]) {
        if (
          (!imageData.lastRetrieved ||
            Date.now() - imageData.lastRetrieved > 24 * 3600 * 1000) &&
          !opts.currentFileIds.includes(id as FileId)
        ) {
          del(id, filesStore);
        }
      }
    });
  }

  async getFiles(ids: FileId[]) {
    return getMany(ids, filesStore).then(
      async (filesData: (BinaryFileData | undefined)[]) => {
        const loadedFiles: BinaryFileData[] = [];
        const erroredFiles = new Map<FileId, true>();

        const filesToSave: [FileId, BinaryFileData][] = [];

        filesData.forEach((data, index) => {
          const id = ids[index];
          if (data) {
            const _data: BinaryFileData = {
              ...data,
              lastRetrieved: Date.now(),
            };
            filesToSave.push([id, _data]);
            loadedFiles.push(_data);
          } else {
            erroredFiles.set(id, true);
          }
        });

        try {
          setMany(filesToSave, filesStore);
        } catch (error) {
          console.warn(error);
        }

        return { loadedFiles, erroredFiles };
      },
    );
  }

  async saveFiles({
    elements,
    files,
  }: {
    elements: readonly ExcalidrawElement[];
    files: BinaryFiles;
  }) {
    const addedFiles = new Map<FileId, BinaryFileData>();

    for (const element of elements) {
      if (
        isInitializedImageElement(element) &&
        files[element.fileId] &&
        !this.savedFiles.has(element.fileId) &&
        !this.savingFiles.has(element.fileId)
      ) {
        addedFiles.set(element.fileId, files[element.fileId]);
        this.savingFiles.set(element.fileId, true);
      }
    }

    const savedFiles = new Map<FileId, BinaryFileData>();
    const erroredFiles = new Map<FileId, BinaryFileData>();

    updateBrowserStateVersion(STORAGE_KEYS.VERSION_FILES);

    await Promise.all(
      [...addedFiles].map(async ([id, fileData]) => {
        try {
          await set(id, fileData, filesStore);
          savedFiles.set(id, fileData);
          this.savedFiles.set(id, true);
        } catch (error: any) {
          console.error(error);
          erroredFiles.set(id, fileData);
        }
        this.savingFiles.delete(id);
      }),
    );

    return { savedFiles, erroredFiles };
  }

  shouldUpdateImageElementStatus(element: ExcalidrawElement) {
    return (
      isInitializedImageElement(element) &&
      element.status === "pending" &&
      this.savedFiles.has(element.fileId)
    );
  }

  shouldPreventUnload(elements: readonly ExcalidrawElement[]) {
    return elements.some((element) => {
      if (
        isInitializedImageElement(element) &&
        !this.savedFiles.has(element.fileId) &&
        this.savingFiles.has(element.fileId)
      ) {
        return true;
      }
      return false;
    });
  }

  reset() {
    this.savedFiles.clear();
    this.savingFiles.clear();
  }
}

const saveDataStateToLocalStorage = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
) => {
  const localStorageQuotaExceeded = appJotaiStore.get(
    localStorageQuotaExceededAtom,
  );
  try {
    const _appState = clearAppStateForLocalStorage(appState);

    if (
      _appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
      _appState.openSidebar.tab === CANVAS_SEARCH_TAB
    ) {
      _appState.openSidebar = null;
    }

    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS,
      JSON.stringify(getNonDeletedElements(elements)),
    );
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_APP_STATE,
      JSON.stringify(_appState),
    );
    updateBrowserStateVersion(STORAGE_KEYS.VERSION_DATA_STATE);
    if (localStorageQuotaExceeded) {
      appJotaiStore.set(localStorageQuotaExceededAtom, false);
    }
  } catch (error: any) {
    console.error(error);
    if (isQuotaExceededError(error) && !localStorageQuotaExceeded) {
      appJotaiStore.set(localStorageQuotaExceededAtom, true);
    }
  }
};

const isQuotaExceededError = (error: any) => {
  return error instanceof DOMException && error.name === "QuotaExceededError";
};

export class LocalData {
  private static _save = debounce(
    async (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
      onFilesSaved: () => void,
    ) => {
      saveDataStateToLocalStorage(elements, appState);

      await this.fileStorage.saveFiles({
        elements,
        files,
      });
      onFilesSaved();
    },
    SAVE_TO_LOCAL_STORAGE_TIMEOUT,
  );

  static save = (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
    onFilesSaved: () => void,
  ) => {
    if (!this.isSavePaused()) {
      this._save(elements, appState, files, onFilesSaved);
    }
  };

  static flushSave = () => {
    this._save.flush();
  };

  static isSavePaused = () => {
    return document.hidden;
  };

  static fileStorage = new LocalFileStorage();
}

export class LibraryIndexedDBAdapter {
  private static idb_name = STORAGE_KEYS.IDB_LIBRARY;
  private static key = "libraryData";

  private static store = createStore(
    `${LibraryIndexedDBAdapter.idb_name}-db`,
    `${LibraryIndexedDBAdapter.idb_name}-store`,
  );

  static async load() {
    const IDBData = await get<LibraryPersistedData>(
      LibraryIndexedDBAdapter.key,
      LibraryIndexedDBAdapter.store,
    );

    return IDBData || null;
  }

  static save(data: LibraryPersistedData): MaybePromise<void> {
    return set(
      LibraryIndexedDBAdapter.key,
      data,
      LibraryIndexedDBAdapter.store,
    );
  }
}

export class LibraryLocalStorageMigrationAdapter {
  static load() {
    const LSData = localStorage.getItem(
      STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_LIBRARY,
    );
    if (LSData != null) {
      const libraryItems: ImportedDataState["libraryItems"] =
        JSON.parse(LSData);
      if (libraryItems) {
        return { libraryItems };
      }
    }
    return null;
  }
  static clear() {
    localStorage.removeItem(STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_LIBRARY);
  }
}
