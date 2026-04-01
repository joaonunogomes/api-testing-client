import { create } from "zustand";
import type {
  Collection,
  Environment,
  ExecuteResponse,
  RequestFile,
  OAuth2TokenState,
} from "@/lib/types";

export interface OpenTab {
  id: string; // collectionId/requestId
  collectionId: string;
  requestId: string;
  label: string;
  method: string;
  request: RequestFile | null;
  response: ExecuteResponse | null;
  isExecuting: boolean;
  isDirty: boolean;
}

interface AppState {
  // Collections
  collections: Collection[];

  // Tabs
  openTabs: OpenTab[];
  activeTabId: string | null;

  // Environments
  environments: Environment[];
  selectedEnvironmentId: string | null;

  // OAuth2 tokens
  oauth2Tokens: Map<string, OAuth2TokenState>;

  // UI state
  sidebarWidth: number;
  expandedNodes: Set<string>;

  // Actions
  setCollections: (collections: Collection[]) => void;
  setEnvironments: (environments: Environment[]) => void;
  setSelectedEnvironmentId: (id: string | null) => void;
  toggleNode: (nodeId: string) => void;
  setSidebarWidth: (width: number) => void;
  setOAuth2Token: (collectionId: string, token: OAuth2TokenState) => void;

  // Tab actions
  openNewTab: () => void;
  openRequest: (collectionId: string, requestId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabRequest: (tabId: string, request: RequestFile) => void;
  setTabResponse: (tabId: string, response: ExecuteResponse | null) => void;
  setTabExecuting: (tabId: string, isExecuting: boolean) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  // Fetch actions
  fetchCollections: () => Promise<void>;
  fetchEnvironments: () => Promise<void>;
  executeTab: (tabId: string) => Promise<void>;
  saveTab: (tabId: string) => Promise<void>;
}

function makeTabId(collectionId: string, requestId: string) {
  return `${collectionId}/${requestId}`;
}

export const useAppStore = create<AppState>((set, get) => ({
  collections: [],
  openTabs: [],
  activeTabId: null,
  environments: [],
  selectedEnvironmentId: null,
  oauth2Tokens: new Map(),
  sidebarWidth: 280,
  expandedNodes: new Set(),

  setCollections: (collections) => set({ collections }),
  setEnvironments: (environments) => set({ environments }),
  setSelectedEnvironmentId: (id) => set({ selectedEnvironmentId: id }),

  toggleNode: (nodeId) =>
    set((state) => {
      const expanded = new Set(state.expandedNodes);
      if (expanded.has(nodeId)) {
        expanded.delete(nodeId);
      } else {
        expanded.add(nodeId);
      }
      return { expandedNodes: expanded };
    }),

  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setOAuth2Token: (collectionId, token) =>
    set((state) => {
      const tokens = new Map(state.oauth2Tokens);
      tokens.set(collectionId, token);
      return { oauth2Tokens: tokens };
    }),

  // --- Tab actions ---

  openNewTab: () => {
    const id = `__new__${Date.now()}`;
    set((s) => ({
      openTabs: [
        ...s.openTabs,
        {
          id,
          collectionId: "",
          requestId: "",
          label: "Untitled Request",
          method: "GET",
          request: {
            meta: { name: "Untitled Request" },
            request: {
              method: "GET",
              url: "",
            },
          },
          response: null,
          isExecuting: false,
          isDirty: false,
        },
      ],
      activeTabId: id,
    }));
  },

  openRequest: async (collectionId, requestId) => {
    const tabId = makeTabId(collectionId, requestId);
    const state = get();

    // If tab already open, just activate it
    const existing = state.openTabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    // Fetch request data
    const res = await fetch(
      `/api/collections/${collectionId}/requests/${requestId}`,
    );
    if (!res.ok) return;
    const request: RequestFile = await res.json();

    set((s) => ({
      openTabs: [
        ...s.openTabs,
        {
          id: tabId,
          collectionId,
          requestId,
          label: request.meta?.name || requestId.split("/").pop() || requestId,
          method: request.request?.method || "GET",
          request,
          response: null,
          isExecuting: false,
          isDirty: false,
        },
      ],
      activeTabId: tabId,
    }));
  },

  closeTab: (tabId) =>
    set((state) => {
      const tabs = state.openTabs.filter((t) => t.id !== tabId);
      let activeTabId = state.activeTabId;

      if (activeTabId === tabId) {
        // Activate the nearest tab
        const closedIndex = state.openTabs.findIndex((t) => t.id === tabId);
        if (tabs.length > 0) {
          activeTabId =
            tabs[Math.min(closedIndex, tabs.length - 1)]?.id || null;
        } else {
          activeTabId = null;
        }
      }

      return { openTabs: tabs, activeTabId };
    }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateTabRequest: (tabId, request) =>
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              request,
              label: request.meta?.name || t.label,
              method: request.request?.method || t.method,
              isDirty: true,
            }
          : t,
      ),
    })),

  setTabResponse: (tabId, response) =>
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.id === tabId ? { ...t, response } : t,
      ),
    })),

  setTabExecuting: (tabId, isExecuting) =>
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.id === tabId ? { ...t, isExecuting } : t,
      ),
    })),

  reorderTabs: (fromIndex, toIndex) =>
    set((state) => {
      const tabs = [...state.openTabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      return { openTabs: tabs };
    }),

  // --- Fetch ---

  fetchCollections: async () => {
    const res = await fetch("/api/collections");
    const collections = await res.json();
    set({ collections });
  },

  fetchEnvironments: async () => {
    const res = await fetch("/api/environments");
    const environments = await res.json();
    set({ environments });
  },

  saveTab: async (tabId) => {
    const state = get();
    const tab = state.openTabs.find((t) => t.id === tabId);
    if (!tab?.request || !tab.collectionId) return;

    await fetch(
      `/api/collections/${tab.collectionId}/requests/${tab.requestId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tab.request),
      },
    );

    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.id === tabId ? { ...t, isDirty: false } : t,
      ),
    }));
  },

  executeTab: async (tabId) => {
    const state = get();
    const tab = state.openTabs.find((t) => t.id === tabId);
    if (!tab?.request) return;

    // Save first (only if it belongs to a collection)
    if (tab.collectionId) {
      await get().saveTab(tabId);
    }

    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.id === tabId ? { ...t, isExecuting: true, response: null } : t,
      ),
    }));

    try {
      let response;

      if (!tab.collectionId) {
        // Unsaved / example tab — execute directly via the server proxy
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestData: tab.request,
            environmentId: state.selectedEnvironmentId,
          }),
        });
        response = await res.json();
      } else {
        const collection = state.collections.find(
          (c) => c.id === tab.collectionId,
        );
        const auth = tab.request.request.auth || collection?.defaults?.auth;
        let oauth2Token: string | undefined;

        if (auth?.type === "oauth2") {
          const tokenState = state.oauth2Tokens.get(tab.collectionId);
          if (tokenState?.accessToken) {
            oauth2Token = tokenState.accessToken;
          }
        }

        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collectionId: tab.collectionId,
            requestId: tab.requestId,
            environmentId: state.selectedEnvironmentId,
            oauth2Token,
          }),
        });
        response = await res.json();
      }

      set((s) => ({
        openTabs: s.openTabs.map((t) =>
          t.id === tabId ? { ...t, response, isExecuting: false } : t,
        ),
      }));
    } catch (e) {
      set((s) => ({
        openTabs: s.openTabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                response: {
                  status: 0,
                  statusText: e instanceof Error ? e.message : "Failed",
                  headers: {},
                  body: e instanceof Error ? e.message : "Request failed",
                  time: 0,
                  size: 0,
                },
                isExecuting: false,
              }
            : t,
        ),
      }));
    }
  },
}));
