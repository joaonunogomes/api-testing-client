import { create } from "zustand";
import type {
  Collection,
  Environment,
  ExecuteResponse,
  HistoryEntry,
  RequestFile,
  OAuth2TokenState,
  MockServerStatus,
} from "@/lib/types";

export interface OpenTab {
  id: string; // collectionId/requestId, __collection__collectionId, __history__, or __environments__
  type?: "request" | "collection-settings" | "history" | "environments";
  collectionId: string;
  requestId: string;
  label: string;
  method: string;
  request: RequestFile | null;
  response: ExecuteResponse | null;
  isExecuting: boolean;
  isDirty: boolean;
}

export const HISTORY_TAB_ID = "__history__";
export const ENVIRONMENTS_TAB_ID = "__environments__";

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

  // Mock servers
  mockServers: MockServerStatus[];

  // History
  history: HistoryEntry[];

  // Session-scoped variables (set by scripts via ac.env.set / ac.setVar)
  sessionRuntimeVars: Record<string, string>;
  sessionEnvOverrides: Record<string, string>;

  // UI state
  theme: "dark" | "light";
  autoCheckUpdates: boolean;
  sidebarWidth: number;
  expandedNodes: Set<string>;
  focusedNodeId: string | null;

  // Actions
  setCollections: (collections: Collection[]) => void;
  setEnvironments: (environments: Environment[]) => void;
  setSelectedEnvironmentId: (id: string | null) => void;
  toggleNode: (nodeId: string) => void;
  setTheme: (theme: "dark" | "light") => void;
  setAutoCheckUpdates: (value: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setFocusedNodeId: (id: string | null) => void;
  setOAuth2Token: (tokenKey: string, token: OAuth2TokenState) => void;
  setRuntimeVar: (name: string, value: string) => void;
  setMockServers: (servers: MockServerStatus[]) => void;
  fetchMockServers: () => Promise<void>;

  // Tab actions
  openNewTab: () => void;
  openRequest: (collectionId: string, requestId: string) => void;
  openCollectionSettings: (collectionId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabRequest: (tabId: string, request: RequestFile) => void;
  setTabResponse: (tabId: string, response: ExecuteResponse | null) => void;
  setTabExecuting: (tabId: string, isExecuting: boolean) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  cancelTab: (tabId: string) => void;

  // History actions
  fetchHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
  openHistoryEntry: (entry: HistoryEntry) => void;
  openHistoryTab: () => void;

  // Environments tab
  openEnvironmentsTab: () => void;

  // Fetch actions
  fetchCollections: () => Promise<void>;
  fetchEnvironments: () => Promise<void>;
  executeTab: (tabId: string) => Promise<void>;
  saveTab: (tabId: string) => Promise<void>;

  // Session persistence
  restoreSession: () => Promise<void>;
}

function makeTabId(collectionId: string, requestId: string) {
  return `${collectionId}/${requestId}`;
}

const STORAGE_KEY = "api-client-session";

interface PersistedSession {
  selectedEnvironmentId: string | null;
  activeTabId: string | null;
  tabs: { id: string; type?: string; collectionId: string; requestId: string }[];
  expandedNodes: string[];
  theme?: "dark" | "light";
  autoCheckUpdates?: boolean;
}

const isClient = typeof window !== "undefined";
let sessionRestored = false;

function saveSession(state: AppState) {
  if (!isClient || !sessionRestored) return;
  try {
    const session: PersistedSession = {
      selectedEnvironmentId: state.selectedEnvironmentId,
      activeTabId: state.activeTabId,
      tabs: state.openTabs
        .filter(
          (t) =>
            t.collectionId ||
            t.id === HISTORY_TAB_ID ||
            t.id === ENVIRONMENTS_TAB_ID,
        ) // skip unsaved/untitled tabs
        .map((t) => ({
          id: t.id,
          type:
            t.type ||
            (t.id === HISTORY_TAB_ID
              ? "history"
              : t.id === ENVIRONMENTS_TAB_ID
                ? "environments"
                : t.id.startsWith("__collection__")
                  ? "collection-settings"
                  : "request"),
          collectionId: t.collectionId,
          requestId: t.requestId,
        })),
      expandedNodes: [...state.expandedNodes],
      theme: state.theme,
      autoCheckUpdates: state.autoCheckUpdates,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore storage errors
  }
}

function loadSession(): PersistedSession | null {
  if (!isClient) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Abort controllers for in-flight requests (not stored in Zustand — not serializable)
const abortControllers = new Map<string, AbortController>();

export const useAppStore = create<AppState>((set, get) => ({
  collections: [],
  openTabs: [],
  activeTabId: null,
  environments: [],
  selectedEnvironmentId: null,
  oauth2Tokens: new Map(),
  mockServers: [],
  history: [],
  sessionRuntimeVars: {},
  sessionEnvOverrides: {},
  theme: "dark",
  autoCheckUpdates: true,
  sidebarWidth: 280,
  expandedNodes: new Set<string>(),
  focusedNodeId: null,

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

  setTheme: (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    set({ theme });
  },
  setAutoCheckUpdates: (value) => set({ autoCheckUpdates: value }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setFocusedNodeId: (id) => set({ focusedNodeId: id }),

  setOAuth2Token: (tokenKey, token) =>
    set((state) => {
      const tokens = new Map(state.oauth2Tokens);
      tokens.set(tokenKey, token);
      return { oauth2Tokens: tokens };
    }),

  setRuntimeVar: (name, value) =>
    set((s) => ({ sessionRuntimeVars: { ...s.sessionRuntimeVars, [name]: value } })),

  setMockServers: (servers) => set({ mockServers: servers }),

  fetchMockServers: async () => {
    try {
      const res = await fetch("/api/mock-server");
      const servers = await res.json();
      set({ mockServers: servers });
    } catch {
      // ignore
    }
  },

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

  openCollectionSettings: (collectionId) => {
    const tabId = `__collection__${collectionId}`;
    const state = get();

    // If tab already open, just activate it
    const existing = state.openTabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    const collection = state.collections.find((c) => c.id === collectionId);
    if (!collection) return;

    set((s) => ({
      openTabs: [
        ...s.openTabs,
        {
          id: tabId,
          type: "collection-settings",
          collectionId,
          requestId: "",
          label: collection.meta.name,
          method: "",
          request: null,
          response: null,
          isExecuting: false,
          isDirty: false,
        },
      ],
      activeTabId: tabId,
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

    // Re-check after async fetch to avoid duplicates from concurrent calls
    set((s) => {
      if (s.openTabs.some((t) => t.id === tabId)) {
        return { activeTabId: tabId };
      }
      return {
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
      };
    });
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

  cancelTab: (tabId) => {
    const controller = abortControllers.get(tabId);
    if (controller) {
      controller.abort();
      abortControllers.delete(tabId);
    }
    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              isExecuting: false,
              response: {
                status: 0,
                statusText: "Cancelled",
                headers: {},
                body: "Request cancelled by user",
                time: 0,
                size: 0,
              },
            }
          : t,
      ),
    }));
  },

  // --- History ---

  fetchHistory: async () => {
    try {
      const res = await fetch("/api/history");
      const history = await res.json();
      set({ history });
    } catch {
      // ignore
    }
  },

  clearHistory: async () => {
    await fetch("/api/history", { method: "DELETE" });
    set({ history: [] });
  },

  openHistoryTab: () => {
    const state = get();
    state.fetchHistory();
    const existing = state.openTabs.find((t) => t.id === HISTORY_TAB_ID);
    if (existing) {
      set({ activeTabId: HISTORY_TAB_ID });
      return;
    }
    set((s) => ({
      openTabs: [
        ...s.openTabs,
        {
          id: HISTORY_TAB_ID,
          type: "history",
          collectionId: "",
          requestId: "",
          label: "History",
          method: "",
          request: null,
          response: null,
          isExecuting: false,
          isDirty: false,
        },
      ],
      activeTabId: HISTORY_TAB_ID,
    }));
  },

  openEnvironmentsTab: () => {
    const state = get();
    const existing = state.openTabs.find((t) => t.id === ENVIRONMENTS_TAB_ID);
    if (existing) {
      set({ activeTabId: ENVIRONMENTS_TAB_ID });
      return;
    }
    set((s) => ({
      openTabs: [
        ...s.openTabs,
        {
          id: ENVIRONMENTS_TAB_ID,
          type: "environments",
          collectionId: "",
          requestId: "",
          label: "Environments",
          method: "",
          request: null,
          response: null,
          isExecuting: false,
          isDirty: false,
        },
      ],
      activeTabId: ENVIRONMENTS_TAB_ID,
    }));
  },

  openHistoryEntry: (entry: HistoryEntry) => {
    const id = `__new__${Date.now()}`;
    set((s) => ({
      openTabs: [
        ...s.openTabs,
        {
          id,
          collectionId: "",
          requestId: "",
          label: entry.request.meta?.name || entry.url,
          method: entry.method,
          request: entry.request,
          response: null,
          isExecuting: false,
          isDirty: false,
        },
      ],
      activeTabId: id,
    }));
  },

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

    const controller = new AbortController();
    abortControllers.set(tabId, controller);

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
            runtimeVars: state.sessionRuntimeVars,
            envOverrides: state.sessionEnvOverrides,
          }),
          signal: controller.signal,
        });
        response = await res.json();
      } else {
        const collection = state.collections.find(
          (c) => c.id === tab.collectionId,
        );
        const auth = tab.request.request.auth || collection?.defaults?.auth;
        let oauth2Token: string | undefined;

        if (auth?.type === "oauth2") {
          // Request-level auth uses tab ID as token key; inherited uses collection ID
          const tokenKey = tab.request.request.auth?.type === "oauth2"
            ? tab.id
            : tab.collectionId;
          const tokenState = state.oauth2Tokens.get(tokenKey);
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
            runtimeVars: state.sessionRuntimeVars,
            envOverrides: state.sessionEnvOverrides,
          }),
          signal: controller.signal,
        });
        response = await res.json();
      }

      abortControllers.delete(tabId);

      // Accumulate session-scoped variables set by scripts
      set((s) => ({
        openTabs: s.openTabs.map((t) =>
          t.id === tabId ? { ...t, response, isExecuting: false } : t,
        ),
        sessionRuntimeVars: { ...s.sessionRuntimeVars, ...response?.runtimeVars },
        sessionEnvOverrides: { ...s.sessionEnvOverrides, ...response?.envOverrides },
      }));

      // Record to history
      if (tab.request && response?.status) {
        const historyEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          method: tab.request.request?.method || "GET",
          url: tab.request.request?.url || "",
          status: response.status,
          statusText: response.statusText,
          time: response.time,
          request: tab.request,
        };
        fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(historyEntry),
        }).then(() => get().fetchHistory()).catch(() => {});
      }
    } catch (e) {
      abortControllers.delete(tabId);
      if (e instanceof DOMException && e.name === "AbortError") return;
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

  restoreSession: async () => {
    const session = loadSession();
    if (!session) {
      sessionRestored = true;
      return;
    }

    // Restore UI state from localStorage (deferred to avoid hydration mismatch)
    set({
      selectedEnvironmentId: session.selectedEnvironmentId ?? null,
      expandedNodes: new Set(session.expandedNodes ?? []),
      ...(session.theme ? { theme: session.theme } : {}),
      ...(typeof session.autoCheckUpdates === "boolean"
        ? { autoCheckUpdates: session.autoCheckUpdates }
        : {}),
    });
    if (session.theme) {
      document.documentElement.setAttribute("data-theme", session.theme);
    }

    // Re-open saved tabs
    for (const tab of session.tabs) {
      const isCollectionTab = tab.type === "collection-settings" || tab.id.startsWith("__collection__");
      const isHistoryTab = tab.type === "history" || tab.id === HISTORY_TAB_ID;
      const isEnvironmentsTab = tab.type === "environments" || tab.id === ENVIRONMENTS_TAB_ID;
      if (isHistoryTab) {
        get().openHistoryTab();
      } else if (isEnvironmentsTab) {
        get().openEnvironmentsTab();
      } else if (isCollectionTab) {
        get().openCollectionSettings(tab.collectionId);
      } else if (tab.collectionId && tab.requestId) {
        await get().openRequest(tab.collectionId, tab.requestId);
      }
    }

    // Restore active tab
    if (session.activeTabId) {
      const exists = get().openTabs.find((t) => t.id === session.activeTabId);
      if (exists) {
        set({ activeTabId: session.activeTabId });
      }
    }

    sessionRestored = true;
  },
}));

// Auto-save session on relevant state changes
useAppStore.subscribe((state, prevState) => {
  if (
    state.openTabs !== prevState.openTabs ||
    state.activeTabId !== prevState.activeTabId ||
    state.selectedEnvironmentId !== prevState.selectedEnvironmentId ||
    state.expandedNodes !== prevState.expandedNodes ||
    state.theme !== prevState.theme ||
    state.autoCheckUpdates !== prevState.autoCheckUpdates
  ) {
    saveSession(state);
  }
});
